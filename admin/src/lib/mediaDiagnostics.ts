const MEDIA_LOG_PREFIX = '[DuolinTing Admin Media]'
const STORAGE_KEY = 'duolinting.admin.media-diagnostics.v1'
const MAX_PERSISTED_ENTRIES = 400
const MAX_CONSOLE_REPLAY_ENTRIES = 80

type DiagnosticLevel = 'error' | 'info' | 'warn'

type DiagnosticEntry = {
  at: string
  details?: Record<string, unknown>
  event: string
  level: DiagnosticLevel
  pageAgeMs: number
  sequence: number
  sessionId: string
}

type PerformanceWithMemory = Performance & {
  memory?: {
    jsHeapSizeLimit: number
    totalJSHeapSize: number
    usedJSHeapSize: number
  }
}

let sequence = 0
let persistTimer: number | null = null
let globalDiagnosticsCleanup: (() => void) | null = null
const pageStartedAt = performance.now()
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const entries: DiagnosticEntry[] = []

const sanitizeUrl = (value: string) => {
  try {
    const url = new URL(value, window.location.href)
    // 媒体诊断只需要来源和路径；查询参数/片段可能包含临时凭证，不写入持久日志。
    return `${url.origin}${url.pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0]
  }
}

const getErrorSnapshot = (error: unknown) => {
  if (error instanceof Error || error instanceof DOMException) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }

  return {
    message: typeof error === 'string' ? error : String(error),
    name: typeof error,
  }
}

const normalizeDiagnosticValue = (
  value: unknown,
  key = '',
  seen = new WeakSet<object>(),
): unknown => {
  if (typeof value === 'string') {
    return /(src|url)$/i.test(key) ? sanitizeUrl(value) : value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value)
  }
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Error || value instanceof DOMException) return getErrorSnapshot(value)
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDiagnosticValue(item, key, seen))
  }

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      normalizeDiagnosticValue(childValue, childKey, seen),
    ]),
  )
}

const readPersistedEntries = (): DiagnosticEntry[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(-MAX_PERSISTED_ENTRIES) : []
  } catch {
    return []
  }
}

const persistEntries = () => {
  persistTimer = null
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_PERSISTED_ENTRIES)))
  } catch (error) {
    console.warn(MEDIA_LOG_PREFIX, 'diagnostics-persist-failed', getErrorSnapshot(error))
  }
}

const schedulePersist = (immediate: boolean) => {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer)
    persistTimer = null
  }

  if (immediate) {
    persistEntries()
    return
  }

  // 合并高频媒体事件，避免诊断本身在播放时反复同步写 localStorage。
  persistTimer = window.setTimeout(persistEntries, 1500)
}

export const getBrowserSnapshot = () => {
  const memory = (performance as PerformanceWithMemory).memory
  return {
    devicePixelRatio: window.devicePixelRatio,
    documentVisibility: document.visibilityState,
    hardwareConcurrency: navigator.hardwareConcurrency,
    language: navigator.language,
    memory: memory
      ? {
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          totalJSHeapSize: memory.totalJSHeapSize,
          usedJSHeapSize: memory.usedJSHeapSize,
        }
      : null,
    online: navigator.onLine,
    pageUrl: sanitizeUrl(window.location.href),
    screen: {
      height: window.screen.height,
      width: window.screen.width,
    },
    userAgent: navigator.userAgent,
    viewport: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
  }
}

export const getMediaSnapshot = (media: HTMLMediaElement | null) =>
  media
    ? {
        buffered: Array.from({ length: media.buffered.length }, (_, index) => ({
          end: media.buffered.end(index),
          start: media.buffered.start(index),
        })),
        currentSrc: sanitizeUrl(media.currentSrc),
        currentTime: media.currentTime,
        duration: media.duration,
        ended: media.ended,
        error: media.error
          ? {
              code: media.error.code,
              message: media.error.message,
            }
          : null,
        networkState: media.networkState,
        paused: media.paused,
        playbackRate: media.playbackRate,
        readyState: media.readyState,
        seeking: media.seeking,
        tagName: media.tagName,
        video: media instanceof HTMLVideoElement
          ? {
              height: media.videoHeight,
              width: media.videoWidth,
            }
          : null,
      }
    : null

export const getWaveformDomSnapshot = (container: HTMLElement | null) => {
  if (!container) return null

  const host = container.firstElementChild
  const root = host?.shadowRoot
  const canvases = root ? Array.from(root.querySelectorAll('canvas')) : []
  const regions = root ? root.querySelectorAll('[part~="region"]').length : 0
  const containerRect = container.getBoundingClientRect()
  const canvasLayouts = canvases.map((canvas) => {
    const rect = canvas.getBoundingClientRect()
    return {
      canvas,
      isVisibleInContainer:
        rect.right > containerRect.left &&
        rect.left < containerRect.right &&
        rect.bottom > containerRect.top &&
        rect.top < containerRect.bottom,
      rect,
    }
  })
  const visibleCanvasLayouts = canvasLayouts.filter((item) => item.isVisibleInContainer)
  // 高倍缩放会生成很多分段 canvas；优先检查当前视口中的分段，而不是固定检查开头。
  const inspectedCanvasLayouts = (
    visibleCanvasLayouts.length > 0 ? visibleCanvasLayouts : canvasLayouts
  ).slice(0, 12)

  return {
    canvasCount: canvases.length,
    canvases: inspectedCanvasLayouts.map(({ canvas, isVisibleInContainer, rect }) => {
      const style = window.getComputedStyle(canvas)
      let nonTransparentProbePixels: number | null = null
      let probeError = ''

      if (isVisibleInContainer && canvas.width > 0 && canvas.height > 0) {
        try {
          const context = canvas.getContext('2d')
          if (context) {
            let visiblePixels = 0
            // 只读取少量竖线，足以区分“仍有波形绘制”和“canvas 被完全清空”，
            // 又不会像读取整张超宽 canvas 那样制造额外内存压力。
            for (let step = 1; step <= 8; step += 1) {
              const x = Math.min(canvas.width - 1, Math.floor((canvas.width * step) / 9))
              const pixels = context.getImageData(x, 0, 1, canvas.height).data
              for (let offset = 3; offset < pixels.length; offset += 4) {
                if (pixels[offset] > 0) visiblePixels += 1
              }
            }
            nonTransparentProbePixels = visiblePixels
          }
        } catch (error) {
          probeError = getErrorSnapshot(error).message
        }
      }

      return {
        backingHeight: canvas.height,
        backingWidth: canvas.width,
        connected: canvas.isConnected,
        cssHeight: rect.height,
        cssWidth: rect.width,
        display: style.display,
        isVisibleInContainer,
        nonTransparentProbePixels,
        opacity: style.opacity,
        probeError,
        visibility: style.visibility,
      }
    }),
    container: {
      connected: container.isConnected,
      height: containerRect.height,
      width: containerRect.width,
    },
    hasShadowRoot: Boolean(root),
    regionCount: regions,
    visibleCanvasCount: visibleCanvasLayouts.length,
  }
}

export const logMediaDiagnostic = (
  event: string,
  details?: Record<string, unknown>,
  level: DiagnosticLevel = 'info',
) => {
  const normalizedDetails = details
    ? normalizeDiagnosticValue(details) as Record<string, unknown>
    : undefined
  const entry: DiagnosticEntry = {
    at: new Date().toISOString(),
    details: normalizedDetails,
    event,
    level,
    pageAgeMs: Math.round(performance.now() - pageStartedAt),
    sequence: ++sequence,
    sessionId,
  }
  entries.push(entry)
  if (entries.length > MAX_PERSISTED_ENTRIES) entries.shift()

  // 同时输出可直接复制的 JSON，避免开发者工具把关键对象折叠成 “Object”。
  console[level](MEDIA_LOG_PREFIX, event, entry, JSON.stringify(entry))
  schedulePersist(level !== 'info' || event.includes('error') || event.includes('blank'))
}

export const observeMediaElement = (media: HTMLMediaElement, role: string) => {
  const events = [
    'abort',
    'canplay',
    'canplaythrough',
    'durationchange',
    'emptied',
    'ended',
    'error',
    'loadeddata',
    'loadedmetadata',
    'loadstart',
    'pause',
    'play',
    'playing',
    'ratechange',
    'seeked',
    'seeking',
    'stalled',
    'suspend',
    'waiting',
  ] as const
  const cleanups = events.map((eventName) => {
    const listener = () => {
      logMediaDiagnostic(
        `media-${role}-${eventName}`,
        { media: getMediaSnapshot(media) },
        eventName === 'error' || eventName === 'stalled' ? 'error' : 'info',
      )
    }
    media.addEventListener(eventName, listener)
    return () => media.removeEventListener(eventName, listener)
  })

  let lastTimeUpdateAt = 0
  const onTimeUpdate = () => {
    const now = performance.now()
    if (now - lastTimeUpdateAt < 5000) return
    lastTimeUpdateAt = now
    logMediaDiagnostic(`media-${role}-heartbeat`, { media: getMediaSnapshot(media) })
  }
  media.addEventListener('timeupdate', onTimeUpdate)

  return () => {
    cleanups.forEach((cleanup) => cleanup())
    media.removeEventListener('timeupdate', onTimeUpdate)
  }
}

export const installGlobalMediaDiagnostics = () => {
  if (globalDiagnosticsCleanup) return globalDiagnosticsCleanup

  const previousEntries = readPersistedEntries()
  entries.push(...previousEntries)
  if (previousEntries.length > 0) {
    const replay = previousEntries.slice(-MAX_CONSOLE_REPLAY_ENTRIES)
    console.warn(
      MEDIA_LOG_PREFIX,
      'previous-session-tail',
      replay,
      JSON.stringify(replay),
    )
  }

  const onError = (event: ErrorEvent) => {
    logMediaDiagnostic('window-error', {
      column: event.colno,
      error: getErrorSnapshot(event.error ?? event.message),
      file: event.filename ? sanitizeUrl(event.filename) : '',
      line: event.lineno,
    }, 'error')
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    logMediaDiagnostic('window-unhandled-rejection', {
      reason: getErrorSnapshot(event.reason),
    }, 'error')
  }
  const onVisibilityChange = () => {
    logMediaDiagnostic('document-visibility-change', getBrowserSnapshot())
  }
  const onPageHide = (event: PageTransitionEvent) => {
    logMediaDiagnostic('window-pagehide', { persisted: event.persisted }, 'warn')
    persistEntries()
  }
  const onPageShow = (event: PageTransitionEvent) => {
    logMediaDiagnostic('window-pageshow', { persisted: event.persisted })
  }
  const onOnline = () => logMediaDiagnostic('window-online', getBrowserSnapshot())
  const onOffline = () => logMediaDiagnostic('window-offline', getBrowserSnapshot(), 'warn')
  const onFreeze = () => logMediaDiagnostic('document-freeze', getBrowserSnapshot(), 'warn')
  const onResume = () => logMediaDiagnostic('document-resume', getBrowserSnapshot())

  let previousHealthAt = performance.now()
  const healthCheckId = window.setInterval(() => {
    const now = performance.now()
    const root = document.getElementById('root')
    const rootRect = root?.getBoundingClientRect()
    const rootStyle = root ? window.getComputedStyle(root) : null
    const eventLoopDelayMs = Math.max(0, now - previousHealthAt - 10000)
    previousHealthAt = now
    logMediaDiagnostic('page-health', {
      browser: getBrowserSnapshot(),
      eventLoopDelayMs: Math.round(eventLoopDelayMs),
      root: root
        ? {
            childElementCount: root.childElementCount,
            connected: root.isConnected,
            display: rootStyle?.display,
            height: rootRect?.height,
            opacity: rootStyle?.opacity,
            visibility: rootStyle?.visibility,
            width: rootRect?.width,
          }
        : null,
    })
  }, 10000)

  const root = document.getElementById('root')
  const rootObserver = root
    ? new MutationObserver(() => {
        if (root.childElementCount === 0) {
          logMediaDiagnostic('react-root-became-empty', {
            browser: getBrowserSnapshot(),
          }, 'error')
        }
      })
    : null
  if (root && rootObserver) {
    rootObserver.observe(root, { childList: true })
  }

  let longTaskObserver: PerformanceObserver | null = null
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration >= 200) {
          logMediaDiagnostic('browser-long-task', {
            durationMs: Math.round(entry.duration),
            name: entry.name,
            startTimeMs: Math.round(entry.startTime),
          }, 'warn')
        }
      })
    })
    longTaskObserver.observe({ entryTypes: ['longtask'] })
  } catch {
    longTaskObserver = null
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('freeze', onFreeze)
  document.addEventListener('resume', onResume)
  logMediaDiagnostic('diagnostics-session-start', getBrowserSnapshot())

  globalDiagnosticsCleanup = () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    document.removeEventListener('freeze', onFreeze)
    document.removeEventListener('resume', onResume)
    window.clearInterval(healthCheckId)
    rootObserver?.disconnect()
    longTaskObserver?.disconnect()
    persistEntries()
    globalDiagnosticsCleanup = null
  }
  return globalDiagnosticsCleanup
}

export const logReactDiagnostic = (
  event: string,
  error: unknown,
  componentStack?: string,
) => {
  logMediaDiagnostic(event, {
    componentStack,
    error: getErrorSnapshot(error),
  }, 'error')
}
