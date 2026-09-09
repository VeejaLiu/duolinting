import {
  Button,
  InputNumber,
  Popover,
  Space,
  Tooltip,
} from 'antd'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  ListPlus,
  Merge,
  Minus,
  Play,
  Plus,
  StepBack,
  StepForward,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import {
  cleanEnglishAnswerText,
  cleanSubtitleSpacing,
  TRANSLATION_LOCALE_LABELS,
  TRANSLATION_TARGET_LOCALES,
  type DraftLine,
} from '../../lib/mediaDraftTools'
import {
  getBrowserSnapshot,
  getMediaSnapshot,
  getWaveformDomSnapshot,
  logMediaDiagnostic,
  observeMediaElement,
} from '../../lib/mediaDiagnostics'
import { SubtitleList } from './SubtitleList'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type AddLineRange = {
  start: number
  end: number
}

type MediaWaveformProps = {
  activeLineIndex: number
  draftLines: DraftLine[]
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>
  sourceUrl: string
  showInspector?: boolean
  showSubtitleList?: boolean
  onActiveLineChange: (index: number) => void
  onAddLine: (range?: AddLineRange) => void
  onPlayLine: (line: DraftLine) => void
  onRemoveLine: (index: number) => void
  // 合并第 index 行与相邻的第 index+1 行（时间与文本都会合并，不可撤销）。
  onMergeLine?: (index: number) => void
  onSetPointFromPlayer: (field: 'start' | 'end', lineIndex: number) => void
  onUpdateLine: (index: number, patch: Partial<DraftLine>, lineId?: string) => void
  onBatchAdjustTiming: (deltaMs: number) => void
}

type WaveformState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'ready'; duration: number }
  | { status: 'error'; message: string }

type WaveformIconButtonProps = {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  busy?: boolean
}

const WaveformIconButton = ({
  label,
  icon,
  onClick,
  disabled = false,
  danger = false,
  busy = false,
}: WaveformIconButtonProps) => (
  <Tooltip title={label} placement="top">
    <Button
      aria-label={label}
      aria-busy={busy}
      className="waveform-icon-button"
      danger={danger}
      disabled={disabled}
      icon={icon}
      onClick={onClick}
      size="small"
      type="default"
    />
  </Tooltip>
)

const formatTimeWithMilliseconds = (seconds: number) => {
  if (!Number.isFinite(seconds)) {
    return '00:00.000'
  }

  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000))
  const minutes = Math.floor(totalMilliseconds / 60000)
  const remainingSeconds = Math.floor((totalMilliseconds % 60000) / 1000)
  const milliseconds = totalMilliseconds % 1000
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

const millisecondsToSeconds = (milliseconds: number) =>
  Math.round(milliseconds) / 1000

const roundToMilliseconds = (seconds: number) =>
  Math.round(seconds * 1000) / 1000

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const MIN_LINE_DURATION_SECONDS = 0.001
const BASE_PIXELS_PER_SECOND = 80
const MIN_ZOOM = 1
const MAX_ZOOM = 20
// 区域在选中/未选中时的填充色。抽成常量是为了在 region 同步时做按需 diff：
// 只有颜色真正变化时才调用 setOptions，避免打字时对全部区域无意义地重绘。
const ACTIVE_REGION_COLOR = 'rgba(37, 99, 235, 0.82)'
const INACTIVE_REGION_COLOR = 'rgba(96, 165, 250, 0.68)'
// 时间对比容差（秒）：start/end 用毫秒级浮点存储，diff 时允许微小误差。
const REGION_TIME_EPSILON = 0.0005

// WaveSurfer 会根据声道给区域写入内联 top/height；制课工作台只需要一条字幕轨，
// 因此每次区域创建或同步时都强制放到波形下半区，避免区域随声道数量发生纵向下溢。
const applyRegionLaneLayout = (region: { element: HTMLElement | null }) => {
  const element = region.element
  if (!element) return

  element.style.setProperty('bottom', 'auto', 'important')
  element.style.setProperty('height', '50%', 'important')
  element.style.setProperty('max-height', '50%', 'important')
  element.style.setProperty('min-height', '0', 'important')
  element.style.setProperty('overflow', 'hidden', 'important')
  element.style.setProperty('top', '50%', 'important')
}
const ZOOM_STEP = 0.5
const getPixelsPerSecond = (zoom: number) =>
  Math.round(BASE_PIXELS_PER_SECOND * zoom)

const clampZoom = (value: number) =>
  Math.round(clamp(value, MIN_ZOOM, MAX_ZOOM) * 4) / 4

const createRegionContent = (line: DraftLine, lineIndex: number, emptyLabel = '未填写字幕') => {
  const content = document.createElement('span')
  content.className = 'waveform-region-label'
  const index = document.createElement('span')
  index.className = 'waveform-region-index'
  // WaveSurfer 将 region 内容放进 Shadow DOM；part 用于让外部样式真正作用到序号徽标。
  index.setAttribute('part', 'waveform-region-index')
  index.setAttribute('aria-hidden', 'true')
  index.textContent = String(lineIndex + 1)

  const text = document.createElement('span')
  text.className = 'waveform-region-text'
  text.setAttribute('part', 'waveform-region-text')
  text.textContent = line.text || emptyLabel

  content.append(index, text)
  return content
}

const isResizeHandleTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('[part*="region-handle"]') !== null

const logMediaDebug = (event: string, details?: Record<string, unknown>) => {
  logMediaDiagnostic(event, details)
}

export function MediaWaveform({
  activeLineIndex,
  draftLines,
  mediaRef,
  sourceUrl,
  showInspector = true,
  showSubtitleList = false,
  onActiveLineChange,
  onAddLine,
  onPlayLine,
  onRemoveLine,
  onMergeLine,
  onSetPointFromPlayer,
  onUpdateLine,
  onBatchAdjustTiming,
}: MediaWaveformProps) {
  const { t } = useAdminLanguage()
  const waveformContainerRef = useRef<HTMLDivElement | null>(null)
  const waveSurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const draftLinesRef = useRef(draftLines)
  const activeLineIndexRef = useRef(activeLineIndex)
  const onActiveLineChangeRef = useRef(onActiveLineChange)
  const onAddLineRef = useRef(onAddLine)
  const onUpdateLineRef = useRef(onUpdateLine)
  const isSyncingRegionsRef = useRef(false)
  const isDraggingRegionRef = useRef(false)
  const timeoutCleanupRef = useRef<(() => void) | null>(null)
  const regionByIdRef = useRef<Record<string, Region>>({})
  // 缓存每个 region 上次应用到的「文本/颜色/起止时间」，用于 region 同步时做按需 diff。
  // 打字时 draftLines 每次都会换成新引用，若不做 diff 就会对全部区域重建 label DOM，
  // 高频编辑下这会拖慢渲染并放大波形 canvas 重绘竞态。
  const regionPropsRef = useRef<Record<string, {
    color: string
    end: number
    index: number
    start: number
    text: string
  }>>({})
  const [currentTime, setCurrentTime] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [batchOffset, setBatchOffset] = useState(0)
  const [isBatchTimingOpen, setIsBatchTimingOpen] = useState(false)
  // 等待媒体完全加载后再解析波形
  const [isMediaReady, setIsMediaReady] = useState(false)
  const [waveform, setWaveform] = useState<WaveformState>({
    status: 'idle',
    message: t('选择媒体后显示音轨波形'),
  })
  const zoomRef = useRef(zoom)
  const waveformStatusRef = useRef(waveform.status)

  const activeLine = draftLines[activeLineIndex]

  const playAdjacentLine = (direction: -1 | 1) => {
    const nextLineIndex = activeLineIndex + direction
    const nextLine = draftLines[nextLineIndex]
    if (!nextLine) return

    // 先切换编辑焦点，再沿用逐句试听逻辑播放目标字幕的完整时间范围。
    onActiveLineChange(nextLineIndex)
    void onPlayLine(nextLine)
  }

  const applyBatchOffset = (nextOffset: number) => {
    const normalizedOffset = Number.isFinite(nextOffset) ? Math.round(nextOffset) : 0
    const delta = normalizedOffset - batchOffset
    if (delta === 0) return

    setBatchOffset(normalizedOffset)
    onBatchAdjustTiming(delta)
  }

  const duration = useMemo(() => {
    if (waveform.status === 'ready') {
      return waveform.duration
    }

    return mediaRef.current?.duration ?? 0
  }, [mediaRef, waveform])

  useEffect(() => {
    draftLinesRef.current = draftLines
  }, [draftLines])

  useEffect(() => {
    activeLineIndexRef.current = activeLineIndex
  }, [activeLineIndex])

  useEffect(() => {
    onActiveLineChangeRef.current = onActiveLineChange
    onAddLineRef.current = onAddLine
    onUpdateLineRef.current = onUpdateLine
  }, [onActiveLineChange, onAddLine, onUpdateLine])

	  // Reset media ready state when source changes
	  useEffect(() => {
    logMediaDebug('waveform-source-changed', {
      sourceUrl,
    })
	    setIsMediaReady(false)
	  }, [sourceUrl])

  // Use setTimeout to defer execution to the next event loop iteration.
  // This ensures that when sourceUrl changes from empty to a valid URL,
  // the <audio>/<video> element has time to mount and attach to mediaRef
  // before we try to initialize WaveSurfer with it.
  // Additionally, we wait for the media to be playable (canplay) before
  // parsing the waveform, ensuring WaveSurfer can decode the audio data reliably.
  useEffect(() => {
    let mediaReadyCleanup: (() => void) | null = null
    let wavesurferCleanup: (() => void) | null = null

    const timeoutId = setTimeout(() => {
	      const media = mediaRef.current
	      const waveformContainer = waveformContainerRef.current
	      if (!sourceUrl) {
        logMediaDebug('waveform-init-skipped-empty-source')
	        setWaveform({
	          status: 'idle',
          message: t('选择媒体后显示音轨波形'),
	        })
        setCurrentTime(0)
        return
      }
	      if (!media || !waveformContainer) {
        logMediaDebug('waveform-init-waiting-for-dom', {
          hasMedia: Boolean(media),
          hasWaveformContainer: Boolean(waveformContainer),
          media: getMediaSnapshot(media),
          sourceUrl,
        })
	        setWaveform({
	          status: 'loading',
          message: t('正在准备媒体时间轴...'),
        })
        return
      }

	      // Check if media is already playable (readyState >= 3 means canplay)
	      if (media.readyState >= 3) {
        logMediaDebug('waveform-media-ready-immediate', {
          media: getMediaSnapshot(media),
          sourceUrl,
        })
	        setIsMediaReady(true)
	        // Media is ready, continue to initWaveSurfer below
	      } else {
        logMediaDebug('waveform-media-wait-canplay', {
          media: getMediaSnapshot(media),
          sourceUrl,
        })
	        setWaveform({
	          status: 'loading',
          message: t('正在等待媒体加载...'),
        })

	        const onCanPlay = () => {
          logMediaDebug('waveform-media-canplay', {
            media: getMediaSnapshot(media),
            sourceUrl,
          })
	          setIsMediaReady(true)
	          media.removeEventListener('canplay', onCanPlay)
	          mediaReadyCleanup = null
        }
        media.addEventListener('canplay', onCanPlay)
        mediaReadyCleanup = () => {
          media.removeEventListener('canplay', onCanPlay)
        }

        // Store cleanup to be called on next run or unmount (critical for preventing memory leaks)
        timeoutCleanupRef.current = () => {
          if (mediaReadyCleanup) {
            mediaReadyCleanup()
          }
        }

        return // Wait for canplay, will re-trigger when isMediaReady changes
      }

	      setWaveform({
	        status: 'loading',
        message: t('正在解析媒体波形...'),
	      })
      logMediaDebug('wavesurfer-create-start', {
        draftLineCount: draftLinesRef.current.length,
        media: getMediaSnapshot(media),
        sourceUrl,
        zoom: zoomRef.current,
      })

      // 只为波形准备独立的音频元素。不能把主 video 交给 WaveSurfer：
      // WaveSurfer 初始化时会读取、监听并解码媒体，主播放器因此可能被同一次
      // 视频解码失败拖垮。这个元素不挂到页面，也不会参与实际播放。
      const waveformMedia = document.createElement('audio')
      waveformMedia.crossOrigin = 'anonymous'
      waveformMedia.muted = true
      waveformMedia.preload = 'auto'
      waveformMedia.src = sourceUrl
      const stopWaveformMediaDiagnostics = observeMediaElement(waveformMedia, 'waveform-decoder')

      const regions = RegionsPlugin.create()
      const wavesurfer = WaveSurfer.create({
        autoCenter: false,
        // 关闭播放时的自动滚动：renderProgress 内部会在光标越界时调用 scrollIntoView，
        // 触发 wavesurfer 的 scroll 处理器对多段 canvas 做“清空+重绘”。这个高频清空与
        // 区域拖动/字幕编辑的渲染并发时容易把波形 canvas 停在空白状态（波形条消失、
        // 但区域字幕层还在）。改为在选中字幕时按需滚动，见下方的 scroll-to-active 逻辑。
        autoScroll: false,
        barGap: 1,
        barMinHeight: 1,
        barRadius: 2,
        barWidth: 2,
        container: waveformContainer,
        cursorColor: '#111827',
        cursorWidth: 2,
        dragToSeek: false,
        fillParent: true,
        // 使用容器实际高度，让 WaveSurfer 的区域百分比始终相对于当前波形高度计算。
        height: 'auto',
        hideScrollbar: false,
        interact: true,
        minPxPerSec: getPixelsPerSecond(zoomRef.current),
        normalize: true,
        plugins: [regions],
        progressColor: '#0f766e',
        // 4k 不是浏览器稳定支持的 AudioContext 采样率，部分视频会因此报
        // PIPELINE_ERROR_DECODE；8k 足够绘制编辑波形且兼容性更好。
        sampleRate: 8000,
        media: waveformMedia,
        waveColor: '#64748b',
      })

      waveSurferRef.current = wavesurfer
      regionsRef.current = regions
      regionByIdRef.current = {}

      let waveformFrameId: number | null = null
      let healthCheckCount = 0
      let blankCheckCount = 0
      let recoveryAttempts = 0
      let recoveryPending = false
      let lastRedrawAt = 0

      const captureWaveformHealth = (reason: string) => {
        const dom = getWaveformDomSnapshot(waveformContainer)
        const currentActiveLineIndex = activeLineIndexRef.current
        const currentActiveLine = draftLinesRef.current[currentActiveLineIndex]
        const visibleCanvases = dom?.canvases.filter((canvas) => canvas.isVisibleInContainer) ?? []
        const sampledCanvases = visibleCanvases.filter(
          (canvas) => canvas.nonTransparentProbePixels !== null,
        )
        const suspectedBlank =
          waveformStatusRef.current === 'ready' &&
          (visibleCanvases.length === 0 ||
            (sampledCanvases.length > 0 &&
              sampledCanvases.every((canvas) => canvas.nonTransparentProbePixels === 0)))
        // 隐藏页面、拖动过程和刚开始重绘时不做恢复。两次定时检查均确认
        // 完整画布为空才重绘，避免抽样落在柱间空隙或短暂渲染造成误触发。
        const canCheck = document.visibilityState === 'visible' &&
          Boolean(dom?.container.connected && dom.container.width > 0 && dom.container.height > 0) &&
          waveformStatusRef.current === 'ready' && Boolean(wavesurfer.getDecodedData()) &&
          !isDraggingRegionRef.current && Date.now() - lastRedrawAt > 1500
        const confirmedBlank = visibleCanvases.length === 0 ||
          visibleCanvases.every((canvas) => canvas.blankConfirmed || canvas.contextLost)
        const details = {
          activeLine: currentActiveLine
            ? {
                end: currentActiveLine.end,
                id: currentActiveLine.id,
                index: currentActiveLineIndex,
                start: currentActiveLine.start,
              }
            : null,
          browser: getBrowserSnapshot(),
          decoded: Boolean(wavesurfer.getDecodedData()),
          duration: wavesurfer.getDuration(),
          mainMedia: getMediaSnapshot(media),
          regionDragInProgress: isDraggingRegionRef.current,
          reason,
          scrollLeft: wavesurfer.getScroll(),
          suspectedBlank,
          confirmedBlank,
          recoveryAttempts,
          waveformDom: dom,
          waveformMedia: getMediaSnapshot(waveformMedia),
          waveformStatus: waveformStatusRef.current,
          zoom: zoomRef.current,
        }

        if (suspectedBlank) {
          logMediaDiagnostic('waveform-blank-suspected', details, 'error')
        } else {
          logMediaDebug('waveform-health', details)
        }
        if (!reason.startsWith('interval-')) return
        if (!canCheck) {
          blankCheckCount = 0
          return
        }
        if (recoveryPending) {
          logMediaDiagnostic('waveform-recovery-result', {
            ...details, recovered: !confirmedBlank && sampledCanvases.some(
              (canvas) => !canvas.blankConfirmed && !canvas.contextLost && !canvas.probeError,
            ),
          }, confirmedBlank ? 'error' : 'info')
          recoveryPending = false
        }
        blankCheckCount = confirmedBlank ? blankCheckCount + 1 : 0
        if (blankCheckCount < 2 || recoveryAttempts >= 3) return
        blankCheckCount = 0
        recoveryAttempts += 1
        logMediaDiagnostic('waveform-recovery-start', { ...details, recoveryAttempts }, 'info')
        try {
          // 使用已经解码的音频重建绘图画布，不重新加载媒体或重建字幕区域。
          // 保留滚动位置，主视频时间和所有未保存的字幕均由现有状态继续管理。
          const scrollLeft = wavesurfer.getScroll()
          wavesurfer.setOptions({})
          wavesurfer.setScroll(scrollLeft)
          recoveryPending = true
        } catch (error) {
          logMediaDiagnostic('waveform-recovery-failed', {
            recoveryAttempts, message: error instanceof Error ? error.message : String(error),
          }, 'error')
        }
      }

      const healthCheckId = window.setInterval(() => {
        healthCheckCount += 1
        captureWaveformHealth(`interval-${healthCheckCount}`)
      }, 5000)

      const updateWaveformCursor = (nextTime: number, isPlaying = false) => {
        if (!wavesurfer.getDecodedData()) {
          return
        }

        const waveformDuration = wavesurfer.getDuration()
        if (!Number.isFinite(waveformDuration) || waveformDuration <= 0) {
          return
        }

        // 连续播放时只更新 WaveSurfer 的渲染进度，不调用 setTime。
        // setTime 会修改 WaveSurfer 所持有的隐藏 audio.currentTime，等同于每帧 seek，
        // 会触发媒体事件和额外解码，导致波形指针一跳一跳。真正的 seek 只在用户主动
        // 点击/拖动波形时发生，由 seekMainMedia 负责同步主播放器。
        wavesurfer.getRenderer().renderProgress(
          clamp(nextTime / waveformDuration, 0, 1),
          isPlaying,
        )
      }

      const syncWaveformToMainMedia = () => {
        const nextTime = Number.isFinite(media.currentTime) ? media.currentTime : 0
        setCurrentTime(nextTime)
        updateWaveformCursor(nextTime, !media.paused && !media.ended)
      }

      const updateWaveformCursorFrame = () => {
        if (!wavesurfer.getDecodedData()) {
          waveformFrameId = null
          return
        }

        const nextTime = Number.isFinite(media.currentTime) ? media.currentTime : 0
        updateWaveformCursor(nextTime, true)

        if (!media.paused && !media.ended) {
          waveformFrameId = window.requestAnimationFrame(updateWaveformCursorFrame)
        } else {
          waveformFrameId = null
        }
      }

      const startWaveformCursorSync = () => {
        if (!wavesurfer.getDecodedData()) {
          return
        }

        if (waveformFrameId === null) {
          waveformFrameId = window.requestAnimationFrame(updateWaveformCursorFrame)
        }
      }

      const stopWaveformCursorSync = () => {
        if (waveformFrameId !== null) {
          window.cancelAnimationFrame(waveformFrameId)
          waveformFrameId = null
        }
        syncWaveformToMainMedia()
      }

      const seekMainMedia = (nextTime: number) => {
        const mediaDuration = Number.isFinite(media.duration) && media.duration > 0
          ? media.duration
          : 0
        const waveformDuration = wavesurfer.getDuration()
        const maxTime = mediaDuration || waveformDuration
        const safeTime = maxTime > 0
          ? clamp(nextTime, 0, maxTime)
          : Math.max(0, nextTime)

        try {
          media.currentTime = safeTime
        } catch {
          // 媒体正在切换 source 时可能暂时拒绝 seek；主播放器稍后会通过
          // timeupdate 同步回来，不应因此打断波形编辑。
        }
        setCurrentTime(safeTime)
        updateWaveformCursor(safeTime, !media.paused && !media.ended)
      }

      const releaseWaveformMedia = () => {
        waveformMedia.pause()
        waveformMedia.removeAttribute('src')
        waveformMedia.load()
      }

      media.addEventListener('loadedmetadata', syncWaveformToMainMedia)
      media.addEventListener('seeking', syncWaveformToMainMedia)
      media.addEventListener('timeupdate', syncWaveformToMainMedia)
      media.addEventListener('play', startWaveformCursorSync)
      media.addEventListener('pause', stopWaveformCursorSync)
      media.addEventListener('ended', stopWaveformCursorSync)

	      const cleanups = [
	        () => media.removeEventListener('loadedmetadata', syncWaveformToMainMedia),
	        () => media.removeEventListener('seeking', syncWaveformToMainMedia),
	        () => media.removeEventListener('timeupdate', syncWaveformToMainMedia),
	        () => media.removeEventListener('play', startWaveformCursorSync),
	        () => media.removeEventListener('pause', stopWaveformCursorSync),
	        () => media.removeEventListener('ended', stopWaveformCursorSync),
	        () => stopWaveformCursorSync(),
	        wavesurfer.on('interaction', (time) => {
          seekMainMedia(time)
        }),
	        wavesurfer.on('ready', (readyDuration) => {
          logMediaDebug('wavesurfer-ready', {
            duration: readyDuration,
            media: getMediaSnapshot(media),
            regionCount: draftLinesRef.current.length,
          })
          setWaveform({
	            status: 'ready',
	            duration: readyDuration,
          })
          syncWaveformToMainMedia()
          startWaveformCursorSync()
          window.requestAnimationFrame(() => captureWaveformHealth('ready-next-frame'))
        }),
	        wavesurfer.on('decode', (decodedDuration) => {
          logMediaDebug('wavesurfer-decode', {
            decodedDuration,
            mainMedia: getMediaSnapshot(media),
            waveformMedia: getMediaSnapshot(waveformMedia),
          })
        }),
        wavesurfer.on('redraw', () => {
          lastRedrawAt = Date.now()
          logMediaDebug('wavesurfer-redraw-start', { recoveryAttempts, scrollLeft: wavesurfer.getScroll() })
        }),
	        wavesurfer.on('redrawcomplete', () => {
          logMediaDebug('wavesurfer-redraw-complete', {
            waveformDom: getWaveformDomSnapshot(waveformContainer),
            zoom: zoomRef.current,
          })
        }),
	        wavesurfer.on('scroll', (visibleStartTime, visibleEndTime, scrollLeft, scrollRight) => {
          logMediaDebug('wavesurfer-scroll', {
            scrollLeft,
            scrollRight,
            visibleEndTime,
            visibleStartTime,
            zoom: zoomRef.current,
          })
        }),
	        wavesurfer.on('zoom', (minPxPerSec) => {
          logMediaDebug('wavesurfer-zoom', {
            minPxPerSec,
            waveformDom: getWaveformDomSnapshot(waveformContainer),
          })
        }),
	        wavesurfer.on('resize', () => {
          logMediaDebug('wavesurfer-resize', {
            waveformDom: getWaveformDomSnapshot(waveformContainer),
          })
        }),
	        wavesurfer.on('error', (error) => {
          logMediaDiagnostic('wavesurfer-error', {
            browser: getBrowserSnapshot(),
            draftLineCount: draftLinesRef.current.length,
            error: {
              message: error.message,
              name: error.name,
              stack: error.stack,
            },
            media: getMediaSnapshot(media),
            sourceUrl,
            waveformDom: getWaveformDomSnapshot(waveformContainer),
            waveformMedia: getMediaSnapshot(waveformMedia),
            waveformStatus: waveformStatusRef.current,
          }, 'error')
          setWaveform({
	            status: 'error',
            message: t('波形解析失败：{{error}}', { error: error.message }),
          })
          // 波形解析失败也必须立即释放独立解码器，避免它继续占用浏览器
          // 的媒体管线，影响主视频后续播放。
          releaseWaveformMedia()
        }),
        regions.on('region-created', (region) => {
          applyRegionLaneLayout(region)
          const isExistingLine = draftLinesRef.current.some(
            (line) => line.id === region.id,
          )
          if (isSyncingRegionsRef.current || isExistingLine) {
            return
          }

          const start = roundToMilliseconds(region.start)
          const end = roundToMilliseconds(
            Math.max(region.end, region.start + MIN_LINE_DURATION_SECONDS),
          )
          region.remove()
          onAddLineRef.current({ start, end })
        }),
        regions.on('region-clicked', (region, event) => {
          if (isResizeHandleTarget(event.target)) {
            return
          }

          event.stopPropagation()
          const index = draftLinesRef.current.findIndex(
            (line) => line.id === region.id,
          )
          if (index >= 0) {
            onActiveLineChangeRef.current(index)
          }

          const regionRect = region.element?.getBoundingClientRect()
          const regionDuration = region.end - region.start
          if (!regionRect || regionRect.width <= 0 || regionDuration <= 0) {
            seekMainMedia(region.start)
            return
          }

          const ratio = clamp((event.clientX - regionRect.left) / regionRect.width, 0, 1)
          const nextTime = roundToMilliseconds(region.start + regionDuration * ratio)
          seekMainMedia(nextTime)
        }),
	        regions.on('region-update', (region) => {
          const index = draftLinesRef.current.findIndex(
            (line) => line.id === region.id,
          )
          if (index < 0) {
            return
          }

	          isDraggingRegionRef.current = true
	          onUpdateLineRef.current(index, {
	            end: roundToMilliseconds(region.end),
	            start: roundToMilliseconds(region.start),
	          }, region.id)
	        }),
	        regions.on('region-updated', (region) => {
          const index = draftLinesRef.current.findIndex(
            (line) => line.id === region.id,
          )
	          if (index >= 0) {
            logMediaDebug('region-drag-finished', {
              end: roundToMilliseconds(region.end),
              index,
              lineId: region.id,
              media: getMediaSnapshot(mediaRef.current),
              start: roundToMilliseconds(region.start),
            })
	            // 最终写回前解除拖动态，让这次重排触发 Region 标签同步；否则序号内容
	            // 会等到下一次无关编辑才刷新。
	            isDraggingRegionRef.current = false
	            onUpdateLineRef.current(index, {
	              end: roundToMilliseconds(region.end),
	              start: roundToMilliseconds(region.start),
            }, region.id)
          }
          isDraggingRegionRef.current = false
        }),
        regions.on('region-removed', (region) => {
          delete regionByIdRef.current[region.id]
        }),
      ]
      const disableDragSelection = regions.enableDragSelection(
        {
          color: 'rgba(15, 118, 110, 0.22)',
          drag: true,
          minLength: MIN_LINE_DURATION_SECONDS,
          resize: true,
          resizeEnd: true,
          resizeStart: true,
        },
        4,
      )

      // Store cleanup functions to be called when timeout is cleared or component unmounts
	      const cleanup = () => {
        logMediaDebug('wavesurfer-destroy', {
          media: getMediaSnapshot(media),
          regionCount: Object.keys(regionByIdRef.current).length,
          sourceUrl,
        })
	        cleanups.forEach((c) => c())
	        window.clearInterval(healthCheckId)
	        stopWaveformMediaDiagnostics()
	        disableDragSelection()
	        regionsRef.current = null
        waveSurferRef.current = null
        regionByIdRef.current = {}
        regionPropsRef.current = {}
        wavesurfer.destroy()
        releaseWaveformMedia()
      }

      // wavesurferCleanup is set when WaveSurfer is successfully created
      wavesurferCleanup = cleanup

      // Store cleanup to be called on next run or unmount
      timeoutCleanupRef.current = () => {
        wavesurferCleanup?.()
        if (mediaReadyCleanup) {
          mediaReadyCleanup()
        }
      }
    }, 0)

    // Cleanup function: clear timeout if effect re-runs, or call timeoutCleanupRef if timeout already fired
    return () => {
      if (timeoutCleanupRef.current) {
        timeoutCleanupRef.current()
        timeoutCleanupRef.current = null
      }
      clearTimeout(timeoutId)
    }
  }, [isMediaReady, mediaRef, sourceUrl, t])

  useEffect(() => {
    zoomRef.current = zoom
    waveformStatusRef.current = waveform.status
    const wavesurfer = waveSurferRef.current
    if (!wavesurfer || waveform.status !== 'ready') {
      return
    }

    wavesurfer.zoom(getPixelsPerSecond(zoom))
  }, [waveform.status, zoom])

  useEffect(() => {
    const regions = regionsRef.current
    if (!regions || waveform.status !== 'ready' || isDraggingRegionRef.current) {
      return
    }

    isSyncingRegionsRef.current = true
    const nextIds = new Set(draftLines.map((line) => line.id))
    let addedRegionCount = 0
    let removedRegionCount = 0
    let updatedRegionCount = 0

    for (const [regionId, region] of Object.entries(regionByIdRef.current)) {
      if (!nextIds.has(regionId)) {
        region.remove()
        delete regionByIdRef.current[regionId]
        delete regionPropsRef.current[regionId]
        removedRegionCount += 1
      }
    }

    draftLines.forEach((line, index) => {
      if (!Number.isFinite(line.start) || !Number.isFinite(line.end)) {
        return
      }

      const start = clamp(line.start, 0, duration)
      const end = clamp(
        Math.max(line.end, start + MIN_LINE_DURATION_SECONDS),
        start + MIN_LINE_DURATION_SECONDS,
        duration,
      )
      const color = index === activeLineIndex ? ACTIVE_REGION_COLOR : INACTIVE_REGION_COLOR
      const region = regionByIdRef.current[line.id]

      if (!region) {
        const nextRegion = regions.addRegion({
          color,
          content: createRegionContent(line, index, t('未填写字幕')),
          drag: true,
          end,
          id: line.id,
          minLength: MIN_LINE_DURATION_SECONDS,
          resize: true,
          resizeEnd: true,
          resizeStart: true,
          start,
        })
        applyRegionLaneLayout(nextRegion)
        regionByIdRef.current[line.id] = nextRegion
        regionPropsRef.current[line.id] = { color, end, index, start, text: line.text }
        addedRegionCount += 1
        return
      }

      // 按需 diff：仅当文本或时间/颜色真正变化时才 setOptions。打字时 draftLines 每次都
      // 换新引用，若不做 diff 会对全部区域重建 label DOM，高频编辑下会拖慢渲染并放大
      // 波形 canvas 重绘竞态（波形条消失、区域字幕层还在）。
      const previousProps = regionPropsRef.current[line.id]
      const textChanged = !previousProps || previousProps.text !== line.text
      const timingChanged =
        !previousProps ||
        previousProps.color !== color ||
        Math.abs(previousProps.start - start) >= REGION_TIME_EPSILON ||
        Math.abs(previousProps.end - end) >= REGION_TIME_EPSILON
      const indexChanged = !previousProps || previousProps.index !== index

      if (!textChanged && !timingChanged && !indexChanged) {
        return
      }

      region.setOptions({
        color,
        ...(textChanged || indexChanged ? { content: createRegionContent(line, index, t('未填写字幕')) } : {}),
        end,
        start,
      })
      applyRegionLaneLayout(region)
      regionPropsRef.current[line.id] = { color, end, index, start, text: line.text }
      updatedRegionCount += 1
    })

    if (addedRegionCount > 0 || removedRegionCount > 0 || updatedRegionCount > 0) {
      logMediaDebug('region-sync-finished', {
        addedRegionCount,
        activeLineIndex,
        draftLineCount: draftLines.length,
        media: getMediaSnapshot(mediaRef.current),
        removedRegionCount,
        totalRegionCount: Object.keys(regionByIdRef.current).length,
        updatedRegionCount,
        waveformStatus: waveform.status,
      })
    }

    isSyncingRegionsRef.current = false
  }, [activeLineIndex, draftLines, duration, mediaRef, t, waveform.status])

  // 选中字幕时，若该行起点不在当前可视范围内，把波形滚动到该行（补偿 autoScroll 关闭后
  // 试听/跳转时光标可能跑到视野外）。仅在越界时滚动一次，不再依赖 renderProgress 逐帧滚动。
  useEffect(() => {
    const wavesurfer = waveSurferRef.current
    const line = draftLinesRef.current[activeLineIndex]
    if (
      !wavesurfer ||
      waveform.status !== 'ready' ||
      !line ||
      !Number.isFinite(line.start)
    ) {
      return
    }

    const pixelX = line.start * getPixelsPerSecond(zoomRef.current)
    const scrollLeft = wavesurfer.getScroll()
    const viewWidth = wavesurfer.getWidth()
    if (pixelX < scrollLeft || pixelX > scrollLeft + viewWidth) {
      wavesurfer.setScroll(Math.max(0, pixelX))
    }
  }, [activeLineIndex, waveform.status])

  return (
    <div className="waveform-panel">
      <div className="waveform-editor-main">
        <div className="waveform-controls" role="toolbar" aria-label={t('音轨波形工具栏')}>
          <div className="waveform-tool-group zoom-control" role="group" aria-label={t('波形缩放')}>
            <WaveformIconButton
              label={t('缩小波形')}
              disabled={zoom <= MIN_ZOOM}
              icon={<ZoomOut size={15} aria-hidden="true" />}
              onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
            />
            <input
              aria-label="波形缩放比例"
              max={MAX_ZOOM}
              min={MIN_ZOOM}
              step={ZOOM_STEP}
              type="range"
              value={zoom}
              onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
            />
            <WaveformIconButton
              label={t('放大波形')}
              disabled={zoom >= MAX_ZOOM}
              icon={<ZoomIn size={15} aria-hidden="true" />}
              onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
            />
            <strong>{zoom.toFixed(1)}x</strong>
          </div>

          <div className="waveform-tool-group waveform-line-actions" role="group" aria-label={t('当前字幕操作')}>
            <WaveformIconButton
              label={t('试听')}
              disabled={!activeLine}
              icon={<Play size={15} aria-hidden="true" />}
              onClick={() => activeLine && onPlayLine(activeLine)}
            />
            <WaveformIconButton
              label={t('上一句')}
              disabled={activeLineIndex <= 0 || draftLines.length === 0}
              icon={<StepBack size={15} aria-hidden="true" />}
              onClick={() => playAdjacentLine(-1)}
            />
            <WaveformIconButton
              label={t('下一句')}
              disabled={activeLineIndex < 0 || activeLineIndex >= draftLines.length - 1}
              icon={<StepForward size={15} aria-hidden="true" />}
              onClick={() => playAdjacentLine(1)}
            />
            <WaveformIconButton
              label={t('设开始')}
              disabled={!activeLine}
              icon={<ArrowLeftToLine size={15} aria-hidden="true" />}
              onClick={() => onSetPointFromPlayer('start', activeLineIndex)}
            />
            <WaveformIconButton
              label={t('设结束')}
              disabled={!activeLine}
              icon={<ArrowRightToLine size={15} aria-hidden="true" />}
              onClick={() => onSetPointFromPlayer('end', activeLineIndex)}
            />
            <WaveformIconButton
              label={t('删除')}
              danger
              disabled={!activeLine}
              icon={<Trash2 size={15} aria-hidden="true" />}
              onClick={() => onRemoveLine(activeLineIndex)}
            />
          </div>

          <div className="waveform-tool-group waveform-actions" role="group" aria-label={t('字幕操作')}>
            <WaveformIconButton
              label={t('新增字幕')}
              disabled={!sourceUrl}
              icon={<ListPlus size={15} aria-hidden="true" />}
              onClick={() => onAddLine()}
            />
            <WaveformIconButton
              label={t('与下一句合并')}
              disabled={!onMergeLine || activeLineIndex < 0 || activeLineIndex >= draftLines.length - 1}
              icon={<Merge size={15} aria-hidden="true" />}
              onClick={() => onMergeLine?.(activeLineIndex)}
            />
          </div>

          <div className="waveform-tool-group waveform-timing-action" role="group" aria-label={t('整体时间偏移')}>
            <Popover
              content={
                <div className="batch-timing-popover">
                  <strong>{t('整体时间偏移')}</strong>
                  <Space align="center" size={4}>
                    <Button
                      aria-label={t('所有字幕减少 500ms')}
                      icon={<ChevronsLeft size={14} aria-hidden="true" />}
                      onClick={() => applyBatchOffset(batchOffset - 500)}
                      size="small"
                      title={t('减少 500ms')}
                    />
                    <Button
                      aria-label={t('所有字幕减少 10ms')}
                      icon={<Minus size={14} aria-hidden="true" />}
                      onClick={() => applyBatchOffset(batchOffset - 10)}
                      size="small"
                      title={t('减少 10ms')}
                    />
                    <InputNumber
                      aria-label={t('自定义时间偏移（毫秒）')}
                      disabled={draftLines.length === 0}
                      onChange={(value) => applyBatchOffset(value ?? 0)}
                      size="small"
                      value={batchOffset}
                    />
                    <span>ms</span>
                    <Button
                      aria-label={t('所有字幕增加 10ms')}
                      icon={<Plus size={14} aria-hidden="true" />}
                      onClick={() => applyBatchOffset(batchOffset + 10)}
                      size="small"
                      title={t('增加 10ms')}
                    />
                    <Button
                      aria-label={t('所有字幕增加 500ms')}
                      icon={<ChevronsRight size={14} aria-hidden="true" />}
                      onClick={() => applyBatchOffset(batchOffset + 500)}
                      size="small"
                      title={t('增加 500ms')}
                    />
                  </Space>
                  <Button
                    block
                    disabled={batchOffset === 0 || draftLines.length === 0}
                    onClick={() => applyBatchOffset(0)}
                    size="small"
                    type="link"
                  >
                    {t('重置为 0')}
                  </Button>
                </div>
              }
              onOpenChange={setIsBatchTimingOpen}
              open={isBatchTimingOpen}
              placement="bottomLeft"
              trigger="click"
            >
              <Tooltip title={t('整体时间偏移')} placement="top">
                <Button
                  aria-label={t('整体时间偏移')}
                  className="waveform-icon-button"
                  disabled={draftLines.length === 0}
                  icon={<Clock size={15} aria-hidden="true" />}
                  size="small"
                  type="default"
                />
              </Tooltip>
            </Popover>
          </div>

          <div className="waveform-time-readout" aria-label="当前播放时间">
            {formatTimeWithMilliseconds(currentTime)} / {formatTimeWithMilliseconds(duration)}
          </div>
        </div>
        <div className="waveform-canvas-wrap">
          {waveform.status === 'idle' || waveform.status === 'loading' ? (
            <div className={`waveform-placeholder ${waveform.status}`}>
              {waveform.message}
            </div>
          ) : null}
          <div
            className={waveform.status === 'ready' ? 'wavesurfer-shell ready' : 'wavesurfer-shell'}
          >
            <div ref={waveformContainerRef} className="wavesurfer-view" />
          </div>
          {waveform.status === 'error' ? (
            <div className={`waveform-placeholder ${waveform.status}`}>
              {waveform.message}
            </div>
          ) : null}
        </div>
        {showSubtitleList ? (
          <SubtitleList
            activeLineIndex={activeLineIndex}
            draftLines={draftLines}
            onActiveLineChange={onActiveLineChange}
          />
        ) : null}
      </div>
      {showInspector && <aside className="waveform-editor-inspector" aria-label={t('字幕编辑器')}>
        <div className="waveform-inspector-heading">
          <strong>{t('字幕编辑')}</strong>
          <span>{draftLines.length} {t('条')}</span>
        </div>
        {activeLine && (
          <div className="subtitle-detail-editor">
          <div className="subtitle-detail-head">
            <strong>{t('当前字幕')}</strong>
            <span>
              {formatTimeWithMilliseconds(activeLine.start)} - {formatTimeWithMilliseconds(activeLine.end)}
            </span>
            <button
              className="mini-command secondary"
              onClick={() => onPlayLine(activeLine)}
              type="button"
            >
              <Play size={14} aria-hidden="true" />
              {t('试听')}
            </button>
            <button
              className="mini-command secondary"
              onClick={() => onSetPointFromPlayer('start', activeLineIndex)}
              type="button"
            >
              {t('设开始')}
            </button>
            <button
              className="mini-command secondary"
              onClick={() => onSetPointFromPlayer('end', activeLineIndex)}
              type="button"
            >
              {t('设结束')}
            </button>
            <button
              className="mini-command danger"
              onClick={() => onRemoveLine(activeLineIndex)}
              type="button"
            >
              <Trash2 size={14} aria-hidden="true" />
              {t('删除')}
            </button>
          </div>
          <div className="subtitle-time-fields">
            <label className="time-ms-field">
              <span>{t('开始')}</span>
              <input
                min="0"
                step="1"
                type="number"
                value={Math.round(activeLine.start * 1000)}
                onChange={(event) =>
                  onUpdateLine(activeLineIndex, {
                    start: millisecondsToSeconds(Number(event.target.value)),
                  })
                }
              />
              <small>ms</small>
            </label>
            <label className="time-ms-field">
              <span>{t('结束')}</span>
              <input
                min="0"
                step="1"
                type="number"
                value={Math.round(activeLine.end * 1000)}
                onChange={(event) =>
                  onUpdateLine(activeLineIndex, {
                    end: millisecondsToSeconds(Number(event.target.value)),
                  })
                }
              />
              <small>ms</small>
            </label>
          </div>
          <div className="subtitle-text-grid">
            <label className="field wide">
              <span>{t('英文字幕')}</span>
              <input
                value={activeLine.text}
                onChange={(event) =>
                  onUpdateLine(activeLineIndex, { text: event.target.value })
                }
                onBlur={(event) =>
                  onUpdateLine(activeLineIndex, {
                    text: cleanEnglishAnswerText(event.target.value),
                  })
                }
              />
            </label>
            <div className="field wide">
              <div className="translation-field-head">
                <span>{t('字幕译文（按语言对照填写）')}</span>
              </div>
              {TRANSLATION_TARGET_LOCALES.map((locale) => (
                <label className="translation-locale-row" key={locale}>
                  <span>{t(TRANSLATION_LOCALE_LABELS[locale])}</span>
                  <input
                    value={activeLine.translations[locale] ?? ''}
                    onChange={(event) =>
                      onUpdateLine(activeLineIndex, {
                        translations: { ...activeLine.translations, [locale]: event.target.value },
                      })
                    }
                    onBlur={(event) =>
                      onUpdateLine(activeLineIndex, {
                        translations: { ...activeLine.translations, [locale]: cleanSubtitleSpacing(event.target.value) },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="field wide answer-field">
              <span>{t('其他可接受答案')}</span>
              <div className="answer-input-list">
                {(activeLine.answers ?? []).map((answer, answerIndex) => (
                  <div className="answer-input-row" key={answerIndex}>
                    <input
                      value={answer}
                      onChange={(event) => {
                        const nextAnswers = [...(activeLine.answers ?? [])]
                        nextAnswers[answerIndex] = event.target.value
                        onUpdateLine(activeLineIndex, { answers: nextAnswers })
                      }}
                      onBlur={(event) => {
                        const nextAnswers = [...(activeLine.answers ?? [])]
                        nextAnswers[answerIndex] = cleanEnglishAnswerText(
                          event.target.value,
                        )
                        onUpdateLine(activeLineIndex, { answers: nextAnswers })
                      }}
                      placeholder={t('填写另一种可接受答案')}
                    />
                    <button
                      className="mini-command"
                      onClick={() =>
                        onUpdateLine(activeLineIndex, {
                          answers: (activeLine.answers ?? []).filter(
                            (_, index) => index !== answerIndex,
                          ),
                        })
                      }
                      type="button"
                    >
                      {t('删除')}
                    </button>
                  </div>
                ))}
                <button
                  className="mini-command"
                  onClick={() =>
                    onUpdateLine(activeLineIndex, {
                      answers: [...(activeLine.answers ?? []), ''],
                    })
                  }
                  type="button"
                >
                  <ListPlus size={14} aria-hidden="true" />
                  {t('添加答案')}
                </button>
              </div>
            </div>
            <label className="field wide">
              <span>{t('关键词，逗号分隔')}</span>
              <input
                value={activeLine.keywordsText}
                onChange={(event) =>
                  onUpdateLine(activeLineIndex, {
                    keywordsText: event.target.value,
                  })
                }
              />
            </label>
          </div>
          </div>
        )}
      </aside>}
    </div>
  )
}
