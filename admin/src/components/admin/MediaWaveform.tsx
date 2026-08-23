import {
  Button,
  InputNumber,
  Modal,
  Popover,
  Progress,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Languages,
  ListPlus,
  Merge,
  Minus,
  Play,
  Plus,
  StepBack,
  StepForward,
  Trash2,
  X,
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
import type { ContentLocale } from '@duolinting/domain'
import { SubtitleList } from './SubtitleList'

type AddLineRange = {
  start: number
  end: number
}

export type TranslationProgress = {
  mode: 'empty' | 'all'
  status: 'running' | 'success' | 'partial' | 'error'
  // “翻译条目”是一句字幕在一种目标语言下的一条译文；例如 59 句 × 3 种语言最多为 177 条。
  total: number
  completed: number
  succeeded: number
  failed: number
  subtitleCount: number
  targetLanguageCount: number
}

type MediaWaveformProps = {
  activeLineIndex: number
  draftLines: DraftLine[]
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>
  sourceUrl: string
  isTranslating?: boolean
  translationProgress?: TranslationProgress | null
  showInspector?: boolean
  showSubtitleList?: boolean
  onActiveLineChange: (index: number) => void
  onAddLine: (range?: AddLineRange) => void
  onPlayLine: (line: DraftLine) => void
  onRemoveLine: (index: number) => void
  // 合并第 index 行与相邻的第 index+1 行（时间与文本都会合并，不可撤销）。
  onMergeLine?: (index: number) => void
  onSetPointFromPlayer: (field: 'start' | 'end', lineIndex: number) => void
  onUpdateLine: (index: number, patch: Partial<DraftLine>) => void
  onBatchAdjustTiming: (deltaMs: number) => void
  onTranslate?: (mode: 'empty' | 'all') => void
  // 单句翻译一次返回全部目标语言的译文（{ locale: 译文 }），由调用方合并到该行的 translations。
  onTranslateSingle?: (text: string) => Promise<Partial<Record<ContentLocale, string>>>
  // 翻译失败的持久错误信息：非空时在翻译工具栏下方渲染横幅，手动关闭或新一轮翻译开始时清除。
  translateError?: string | null
  onDismissTranslateError?: () => void
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

type TranslationProgressPopoverProps = {
  progress: TranslationProgress | null | undefined
}

const TranslationProgressPopover = ({ progress }: TranslationProgressPopoverProps) => {
  if (!progress) {
    return (
      <div className="translation-progress-popover">
        <Typography.Text strong>正在准备翻译...</Typography.Text>
        <Progress percent={0} showInfo={false} size="small" status="active" />
      </div>
    )
  }

  const percent = progress.total === 0
    ? 100
    : Math.round((progress.completed / progress.total) * 100)
  const remaining = Math.max(0, progress.total - progress.completed)
  const isRunning = progress.status === 'running'
  const needsAttention = progress.status === 'partial' || progress.status === 'error'
  const title = isRunning
    ? progress.mode === 'all'
      ? '正在重新翻译全部译文'
      : '正在补齐缺失译文'
    : progress.total === 0
      ? '无需翻译'
      : progress.status === 'success'
        ? '翻译完成'
        : progress.status === 'partial'
          ? '翻译完成，部分条目失败'
          : '翻译中断'
  const progressStatus = needsAttention
    ? 'exception'
    : progress.status === 'success'
      ? 'success'
      : 'active'

  return (
    <div className="translation-progress-popover">
      <div className="translation-progress-heading">
        <Typography.Text strong>{title}</Typography.Text>
        <Tag color={isRunning ? 'processing' : needsAttention ? 'error' : 'success'}>
          {isRunning ? `${percent}%` : progress.status === 'error' ? '已中断' : needsAttention ? '需检查' : '已完成'}
        </Tag>
      </div>
      <Progress
        percent={percent}
        showInfo={false}
        size="small"
        status={progressStatus}
      />
      <div className="translation-progress-metrics">
        <div>
          <span>已翻译</span>
          <strong>{progress.succeeded}</strong>
        </div>
        <div>
          <span>剩余</span>
          <strong>{remaining}</strong>
        </div>
        <div>
          <span>失败</span>
          <strong className={progress.failed > 0 ? 'is-error' : undefined}>{progress.failed}</strong>
        </div>
      </div>
      <Typography.Text className="translation-progress-note" type="secondary">
        本次涉及 {progress.subtitleCount} 句字幕、{progress.targetLanguageCount} 种目标语言，按译文条目统计
      </Typography.Text>
    </div>
  )
}

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
const MEDIA_LOG_PREFIX = '[DuolinTing Admin Media]'

const getPixelsPerSecond = (zoom: number) =>
  Math.round(BASE_PIXELS_PER_SECOND * zoom)

const clampZoom = (value: number) =>
  Math.round(clamp(value, MIN_ZOOM, MAX_ZOOM) * 4) / 4

const createRegionContent = (line: DraftLine, lineIndex: number) => {
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
  text.textContent = line.text || '未填写字幕'

  content.append(index, text)
  return content
}

const isResizeHandleTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('[part*="region-handle"]') !== null

const getMediaSnapshot = (media: HTMLMediaElement | null) =>
  media
    ? {
        currentSrc: media.currentSrc,
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
        readyState: media.readyState,
        tagName: media.tagName,
      }
    : null

const logMediaDebug = (event: string, details?: Record<string, unknown>) => {
  console.info(MEDIA_LOG_PREFIX, event, {
    at: new Date().toISOString(),
    ...details,
  })
}

export function MediaWaveform({
  activeLineIndex,
  draftLines,
  mediaRef,
  sourceUrl,
  isTranslating,
  translationProgress,
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
  onTranslate,
  onTranslateSingle,
  translateError,
  onDismissTranslateError,
}: MediaWaveformProps) {
  const waveformContainerRef = useRef<HTMLDivElement | null>(null)
  const waveSurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const draftLinesRef = useRef(draftLines)
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
  const [isTranslationProgressOpen, setIsTranslationProgressOpen] = useState(false)
  const [translationProgressMode, setTranslationProgressMode] = useState<'empty' | 'all'>('empty')
  const [isTranslatingSingle, setIsTranslatingSingle] = useState(false)
  // 等待媒体完全加载后再解析波形
  const [isMediaReady, setIsMediaReady] = useState(false)
  const [waveform, setWaveform] = useState<WaveformState>({
    status: 'idle',
    message: '选择媒体后显示音轨波形',
  })
  const zoomRef = useRef(zoom)
  const waveformStatusRef = useRef(waveform.status)

  const activeLine = draftLines[activeLineIndex]

  const startTranslation = (mode: 'empty' | 'all') => {
    setTranslationProgressMode(mode)
    setIsTranslationProgressOpen(true)
    onTranslate?.(mode)
  }

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
	          message: '选择媒体后显示音轨波形',
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
	          message: '正在准备媒体时间轴...',
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
	          message: '正在等待媒体加载...',
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
	        message: '正在解析媒体波形...',
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
        }),
	        wavesurfer.on('error', (error) => {
          logMediaDebug('wavesurfer-error', {
            draftLineCount: draftLinesRef.current.length,
            error: {
              message: error.message,
              name: error.name,
              stack: error.stack,
            },
            media: getMediaSnapshot(media),
            sourceUrl,
            waveformStatus: waveformStatusRef.current,
          })
          setWaveform({
	            status: 'error',
	            message: `波形解析失败：${error.message}`,
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
	          })
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
	            onUpdateLineRef.current(index, {
	              end: roundToMilliseconds(region.end),
	              start: roundToMilliseconds(region.start),
            })
          }
          window.setTimeout(() => {
            isDraggingRegionRef.current = false
          }, 0)
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
	  }, [mediaRef, sourceUrl, isMediaReady])

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
          content: createRegionContent(line, index),
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
        ...(textChanged || indexChanged ? { content: createRegionContent(line, index) } : {}),
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
  }, [activeLineIndex, draftLines, duration, mediaRef, waveform.status])

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
        <div className="waveform-controls" role="toolbar" aria-label="音轨波形工具栏">
          <div className="waveform-tool-group zoom-control" role="group" aria-label="波形缩放">
            <WaveformIconButton
              label="缩小波形"
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
              label="放大波形"
              disabled={zoom >= MAX_ZOOM}
              icon={<ZoomIn size={15} aria-hidden="true" />}
              onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
            />
            <strong>{zoom.toFixed(1)}x</strong>
          </div>

          <div className="waveform-tool-group waveform-line-actions" role="group" aria-label="当前字幕操作">
            <WaveformIconButton
              label="试听"
              disabled={!activeLine}
              icon={<Play size={15} aria-hidden="true" />}
              onClick={() => activeLine && onPlayLine(activeLine)}
            />
            <WaveformIconButton
              label="上一句"
              disabled={activeLineIndex <= 0 || draftLines.length === 0}
              icon={<StepBack size={15} aria-hidden="true" />}
              onClick={() => playAdjacentLine(-1)}
            />
            <WaveformIconButton
              label="下一句"
              disabled={activeLineIndex < 0 || activeLineIndex >= draftLines.length - 1}
              icon={<StepForward size={15} aria-hidden="true" />}
              onClick={() => playAdjacentLine(1)}
            />
            <WaveformIconButton
              label="设开始"
              disabled={!activeLine}
              icon={<ArrowLeftToLine size={15} aria-hidden="true" />}
              onClick={() => onSetPointFromPlayer('start', activeLineIndex)}
            />
            <WaveformIconButton
              label="设结束"
              disabled={!activeLine}
              icon={<ArrowRightToLine size={15} aria-hidden="true" />}
              onClick={() => onSetPointFromPlayer('end', activeLineIndex)}
            />
            <WaveformIconButton
              label="删除"
              danger
              disabled={!activeLine}
              icon={<Trash2 size={15} aria-hidden="true" />}
              onClick={() => onRemoveLine(activeLineIndex)}
            />
          </div>

          <div className="waveform-tool-group waveform-actions" role="group" aria-label="字幕操作">
            <WaveformIconButton
              label="新增字幕"
              disabled={!sourceUrl}
              icon={<ListPlus size={15} aria-hidden="true" />}
              onClick={() => onAddLine()}
            />
            <WaveformIconButton
              label="与下一句合并"
              disabled={!onMergeLine || activeLineIndex < 0 || activeLineIndex >= draftLines.length - 1}
              icon={<Merge size={15} aria-hidden="true" />}
              onClick={() => onMergeLine?.(activeLineIndex)}
            />
            <Popover
              autoAdjustOverflow={false}
              content={<TranslationProgressPopover progress={translationProgress} />}
              onOpenChange={(open) => {
                if (open && isTranslating && translationProgressMode === 'empty') {
                  setIsTranslationProgressOpen(true)
                } else if (!open) {
                  setIsTranslationProgressOpen(false)
                }
              }}
              open={isTranslationProgressOpen && translationProgressMode === 'empty'}
              placement="top"
              trigger="click"
            >
              <span className="waveform-popover-trigger">
                <WaveformIconButton
                  label={isTranslating && translationProgressMode === 'empty' ? '翻译中...' : 'AI 翻译缺失译文'}
                  busy={Boolean(isTranslating && translationProgressMode === 'empty')}
                  disabled={!sourceUrl || !onTranslate || Boolean(isTranslating && translationProgressMode !== 'empty')}
                  icon={isTranslating && translationProgressMode === 'empty'
                    ? <Spin aria-hidden="true" size="small" />
                    : <Languages size={15} aria-hidden="true" />}
                  onClick={() => {
                    if (isTranslating) {
                      return
                    }
                    startTranslation('empty')
                  }}
                />
              </span>
            </Popover>
            <Popover
              autoAdjustOverflow={false}
              content={<TranslationProgressPopover progress={translationProgress} />}
              onOpenChange={(open) => {
                if (open && isTranslating && translationProgressMode === 'all') {
                  setIsTranslationProgressOpen(true)
                } else if (!open) {
                  setIsTranslationProgressOpen(false)
                }
              }}
              open={isTranslationProgressOpen && translationProgressMode === 'all'}
              placement="top"
              trigger="click"
            >
              <span className="waveform-popover-trigger">
                <WaveformIconButton
                  label={isTranslating && translationProgressMode === 'all' ? '翻译中...' : '全部重译'}
                  busy={Boolean(isTranslating && translationProgressMode === 'all')}
                  disabled={!sourceUrl || !onTranslate || Boolean(isTranslating && translationProgressMode !== 'all')}
                  icon={isTranslating && translationProgressMode === 'all'
                    ? <Spin aria-hidden="true" size="small" />
                    : <Languages size={15} aria-hidden="true" />}
                  onClick={() => {
                    if (isTranslating) {
                      return
                    }
                    Modal.confirm({
                      cancelText: '取消',
                      centered: true,
                      content: '此操作会覆盖中文、ไทย、日本語中所有已经填写的译文。',
                      okText: '继续重译',
                      onOk: () => startTranslation('all'),
                      title: '确定全部重译？',
                    })
                  }}
                />
              </span>
            </Popover>
          </div>

          <div className="waveform-tool-group waveform-timing-action" role="group" aria-label="整体时间偏移">
            <Popover
              content={
                <div className="batch-timing-popover">
                  <strong>整体时间偏移</strong>
                  <Space align="center" size={4}>
                    <Button
                      aria-label="所有字幕减少 500ms"
                      icon={<ChevronsLeft size={14} aria-hidden="true" />}
                      onClick={() => applyBatchOffset(batchOffset - 500)}
                      size="small"
                      title="减少 500ms"
                    />
                    <Button
                      aria-label="所有字幕减少 10ms"
                      icon={<Minus size={14} aria-hidden="true" />}
                      onClick={() => applyBatchOffset(batchOffset - 10)}
                      size="small"
                      title="减少 10ms"
                    />
                    <InputNumber
                      aria-label="自定义时间偏移（毫秒）"
                      disabled={draftLines.length === 0}
                      onChange={(value) => applyBatchOffset(value ?? 0)}
                      size="small"
                      value={batchOffset}
                    />
                    <span>ms</span>
                    <Button
                      aria-label="所有字幕增加 10ms"
                      icon={<Plus size={14} aria-hidden="true" />}
                      onClick={() => applyBatchOffset(batchOffset + 10)}
                      size="small"
                      title="增加 10ms"
                    />
                    <Button
                      aria-label="所有字幕增加 500ms"
                      icon={<ChevronsRight size={14} aria-hidden="true" />}
                      onClick={() => applyBatchOffset(batchOffset + 500)}
                      size="small"
                      title="增加 500ms"
                    />
                  </Space>
                  <Button
                    block
                    disabled={batchOffset === 0 || draftLines.length === 0}
                    onClick={() => applyBatchOffset(0)}
                    size="small"
                    type="link"
                  >
                    重置为 0
                  </Button>
                </div>
              }
              onOpenChange={setIsBatchTimingOpen}
              open={isBatchTimingOpen}
              placement="bottomLeft"
              trigger="click"
            >
              <Tooltip title="整体时间偏移" placement="top">
                <Button
                  aria-label="整体时间偏移"
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
        {translateError ? (
          <div className="translate-error-banner" role="alert">
            <span className="translate-error-text">{translateError}</span>
            <button
              aria-label="关闭翻译错误提示"
              className="translate-error-dismiss"
              onClick={onDismissTranslateError}
              type="button"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}
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
      {showInspector && <aside className="waveform-editor-inspector" aria-label="字幕编辑器">
        <div className="waveform-inspector-heading">
          <strong>字幕编辑</strong>
          <span>{draftLines.length} 条</span>
        </div>
        {activeLine && (
          <div className="subtitle-detail-editor">
          <div className="subtitle-detail-head">
            <strong>当前字幕</strong>
            <span>
              {formatTimeWithMilliseconds(activeLine.start)} - {formatTimeWithMilliseconds(activeLine.end)}
            </span>
            <button
              className="mini-command secondary"
              onClick={() => onPlayLine(activeLine)}
              type="button"
            >
              <Play size={14} aria-hidden="true" />
              试听
            </button>
            <button
              className="mini-command secondary"
              onClick={() => onSetPointFromPlayer('start', activeLineIndex)}
              type="button"
            >
              设开始
            </button>
            <button
              className="mini-command secondary"
              onClick={() => onSetPointFromPlayer('end', activeLineIndex)}
              type="button"
            >
              设结束
            </button>
            <button
              className="mini-command danger"
              onClick={() => onRemoveLine(activeLineIndex)}
              type="button"
            >
              <Trash2 size={14} aria-hidden="true" />
              删除
            </button>
          </div>
          <div className="subtitle-time-fields">
            <label className="time-ms-field">
              <span>开始</span>
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
              <span>结束</span>
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
              <span>英文字幕</span>
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
                <span>字幕译文（按语言对照填写）</span>
                <button
                  className="mini-command secondary"
                  disabled={!activeLine.text.trim() || isTranslatingSingle || !onTranslateSingle}
                  onClick={async () => {
                    if (!onTranslateSingle) return
                    setIsTranslatingSingle(true)
                    try {
                      // 一次生成全部目标语言译文，合并进当前行；缺失的语言保持原值。
                      const translations = await onTranslateSingle(activeLine.text)
                      const cleanedTranslations = { ...activeLine.translations }
                      Object.entries(translations).forEach(([locale, value]) => {
                        cleanedTranslations[locale as ContentLocale] = cleanSubtitleSpacing(value ?? '')
                      })
                      onUpdateLine(activeLineIndex, { translations: cleanedTranslations })
                    } finally {
                      setIsTranslatingSingle(false)
                    }
                  }}
                  title="为当前这一句生成所有语言的译文"
                  type="button"
                >
                  <Languages size={14} aria-hidden="true" />
                  {isTranslatingSingle ? '翻译中...' : 'AI 翻译本句'}
                </button>
              </div>
              {TRANSLATION_TARGET_LOCALES.map((locale) => (
                <label className="translation-locale-row" key={locale}>
                  <span>{TRANSLATION_LOCALE_LABELS[locale]}</span>
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
              <span>其他可接受答案</span>
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
                      placeholder="填写另一种可接受答案"
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
                      删除
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
                  添加答案
                </button>
              </div>
            </div>
            <label className="field wide">
              <span>关键词，逗号分隔</span>
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
