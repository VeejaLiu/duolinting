import {
  ChevronsLeft,
  ChevronsRight,
  Languages,
  ListPlus,
  Merge,
  Minus,
  Play,
  Plus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js'
import {
  cleanEnglishAnswerText,
  cleanSubtitleSpacing,
  TRANSLATION_LOCALE_LABELS,
  TRANSLATION_TARGET_LOCALES,
  type DraftLine,
} from '../../lib/mediaDraftTools'
import type { ContentLocale } from '@duolinting/domain'

type AddLineRange = {
  start: number
  end: number
}

type MediaWaveformProps = {
  activeLineIndex: number
  draftLines: DraftLine[]
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>
  sourceUrl: string
  isTranslating?: boolean
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
const ZOOM_STEP = 0.5
const MEDIA_LOG_PREFIX = '[DuolinTing Admin Media]'

const getPixelsPerSecond = (zoom: number) =>
  Math.round(BASE_PIXELS_PER_SECOND * zoom)

const clampZoom = (value: number) =>
  Math.round(clamp(value, MIN_ZOOM, MAX_ZOOM) * 4) / 4

const createRegionContent = (line: DraftLine) => {
  const content = document.createElement('span')
  content.className = 'waveform-region-label'
  content.textContent = line.text || '未填写字幕'
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
  const timelineContainerRef = useRef<HTMLDivElement | null>(null)
  const waveSurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const draftLinesRef = useRef(draftLines)
  const onActiveLineChangeRef = useRef(onActiveLineChange)
  const onAddLineRef = useRef(onAddLine)
  const onUpdateLineRef = useRef(onUpdateLine)
  const isSyncingRegionsRef = useRef(false)
  const isDraggingRegionRef = useRef(false)
  const timeoutCleanupRef = useRef<(() => void) | null>(null)
  const regionByIdRef = useRef<Record<string, any>>({})
  const [currentTime, setCurrentTime] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [batchOffset, setBatchOffset] = useState(0)
  const [isTranslatingSingle, setIsTranslatingSingle] = useState(false)
  // 等待媒体完全加载后再解析波形
  const [isMediaReady, setIsMediaReady] = useState(false)
  const [waveform, setWaveform] = useState<WaveformState>({
    status: 'idle',
    message: '选择媒体后显示音轨波形',
  })

  const activeLine = draftLines[activeLineIndex]
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
  // Additionally, we wait for the media to be fully loaded (canplaythrough) before
  // parsing the waveform, ensuring WaveSurfer can decode the audio data reliably.
  useEffect(() => {
    let mediaReadyCleanup: (() => void) | null = null
    let wavesurferCleanup: (() => void) | null = null

    const timeoutId = setTimeout(() => {
	      const media = mediaRef.current
	      const waveformContainer = waveformContainerRef.current
	      const timelineContainer = timelineContainerRef.current
	      if (!sourceUrl) {
        logMediaDebug('waveform-init-skipped-empty-source')
	        setWaveform({
	          status: 'idle',
	          message: '选择媒体后显示音轨波形',
	        })
        setCurrentTime(0)
        return
      }
	      if (!media || !waveformContainer || !timelineContainer) {
        logMediaDebug('waveform-init-waiting-for-dom', {
          hasMedia: Boolean(media),
          hasTimelineContainer: Boolean(timelineContainer),
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

	      // Check if media is already fully loaded (readyState >= 3 means canplaythrough)
	      if (media.readyState >= 3) {
        logMediaDebug('waveform-media-ready-immediate', {
          media: getMediaSnapshot(media),
          sourceUrl,
        })
	        setIsMediaReady(true)
	        // Media is ready, continue to initWaveSurfer below
	      } else {
        logMediaDebug('waveform-media-wait-canplaythrough', {
          media: getMediaSnapshot(media),
          sourceUrl,
        })
	        setWaveform({
	          status: 'loading',
	          message: '正在等待媒体加载...',
        })

	        const onCanPlayThrough = () => {
          logMediaDebug('waveform-media-canplaythrough', {
            media: getMediaSnapshot(media),
            sourceUrl,
          })
	          setIsMediaReady(true)
	          media.removeEventListener('canplaythrough', onCanPlayThrough)
	          mediaReadyCleanup = null
        }
        media.addEventListener('canplaythrough', onCanPlayThrough)
        mediaReadyCleanup = () => {
          media.removeEventListener('canplaythrough', onCanPlayThrough)
        }

        // Store cleanup to be called on next run or unmount (critical for preventing memory leaks)
        timeoutCleanupRef.current = () => {
          if (mediaReadyCleanup) {
            mediaReadyCleanup()
          }
        }

        return // Wait for canplaythrough, will re-trigger when isMediaReady changes
      }

	      setWaveform({
	        status: 'loading',
	        message: '正在解析媒体波形...',
	      })
      logMediaDebug('wavesurfer-create-start', {
        draftLineCount: draftLinesRef.current.length,
        media: getMediaSnapshot(media),
        sourceUrl,
        zoom,
      })

      const regions = RegionsPlugin.create()
      const timeline = TimelinePlugin.create({
        container: timelineContainer,
        formatTimeCallback: formatTimeWithMilliseconds,
        height: 24,
        primaryLabelSpacing: 6,
        secondaryLabelSpacing: 3,
        style: {
          color: '#475569',
          fontWeight: '700',
        },
      })
      const wavesurfer = WaveSurfer.create({
        autoCenter: false,
        autoScroll: true,
        barGap: 1,
        barMinHeight: 1,
        barRadius: 2,
        barWidth: 2,
        container: waveformContainer,
        cursorColor: '#111827',
        cursorWidth: 2,
        dragToSeek: false,
        fillParent: true,
        height: 128,
        hideScrollbar: false,
        interact: true,
        media,
        minPxPerSec: getPixelsPerSecond(zoom),
        normalize: true,
        plugins: [regions, timeline],
        progressColor: '#0f766e',
        sampleRate: 4000,
        waveColor: '#64748b',
      })

      waveSurferRef.current = wavesurfer
      regionsRef.current = regions
      regionByIdRef.current = {}

	      const cleanups = [
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
          setCurrentTime(wavesurfer.getCurrentTime())
        }),
        wavesurfer.on('timeupdate', (time) => {
          setCurrentTime(time)
        }),
        wavesurfer.on('seeking', (time) => {
          setCurrentTime(time)
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
            waveformStatus: waveform.status,
          })
	          setWaveform({
	            status: 'error',
	            message: `波形解析失败：${error.message}`,
          })
        }),
        regions.on('region-created', (region) => {
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
            wavesurfer.setTime(region.start)
            setCurrentTime(region.start)
            return
          }

          const ratio = clamp((event.clientX - regionRect.left) / regionRect.width, 0, 1)
          const nextTime = roundToMilliseconds(region.start + regionDuration * ratio)
          wavesurfer.setTime(nextTime)
          setCurrentTime(nextTime)
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
        wavesurfer.destroy()
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
      const isActive = index === activeLineIndex
      const region = regionByIdRef.current[line.id]

      if (!region) {
        regionByIdRef.current[line.id] = regions.addRegion({
          color: isActive
            ? 'rgba(37, 99, 235, 0.82)'
            : 'rgba(96, 165, 250, 0.68)',
          content: createRegionContent(line),
          drag: true,
          end,
          id: line.id,
          minLength: MIN_LINE_DURATION_SECONDS,
          channelIdx: 1,
          resize: true,
          resizeEnd: true,
          resizeStart: true,
          start,
        })
        addedRegionCount += 1
        return
      }

      region.setOptions({
        color: isActive
          ? 'rgba(37, 99, 235, 0.82)'
          : 'rgba(96, 165, 250, 0.68)',
        content: createRegionContent(line),
        end,
        start,
      })
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
  }, [activeLineIndex, draftLines, duration, waveform.status])

  return (
    <div className="waveform-panel">
      <div className="waveform-head">
        <span>音轨波形</span>
        <strong>
          {formatTimeWithMilliseconds(currentTime)} / {formatTimeWithMilliseconds(duration)}
        </strong>
      </div>
      <div className="waveform-controls">
        <div className="zoom-control" role="group" aria-label="波形缩放">
          <span id="waveform-zoom-label">缩放</span>
          <button
            aria-label="缩小波形"
            className="icon-command"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
            title="缩小波形"
            type="button"
          >
            <ZoomOut size={15} aria-hidden="true" />
          </button>
          <input
            aria-label="波形缩放比例"
            aria-labelledby="waveform-zoom-label"
            max={MAX_ZOOM}
            min={MIN_ZOOM}
            step={ZOOM_STEP}
            type="range"
            value={zoom}
            onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
          />
          <button
            aria-label="放大波形"
            className="icon-command"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
            title="放大波形"
            type="button"
          >
            <ZoomIn size={15} aria-hidden="true" />
          </button>
          <strong>{zoom.toFixed(1)}x</strong>
        </div>
        <div className="batch-timing-control" role="group" aria-label="批量调整字幕时间">
          <span>时间偏移</span>
          <button
            aria-label="减少 500ms"
            className="icon-command"
            disabled={draftLines.length === 0}
            onClick={() => {
              const delta = -500
              setBatchOffset((o) => o + delta)
              onBatchAdjustTiming(delta)
            }}
            title="所有字幕减少 500ms"
            type="button"
          >
            <ChevronsLeft size={14} aria-hidden="true" />
          </button>
          <button
            aria-label="减少 10ms"
            className="icon-command"
            disabled={draftLines.length === 0}
            onClick={() => {
              const delta = -10
              setBatchOffset((o) => o + delta)
              onBatchAdjustTiming(delta)
            }}
            title="所有字幕减少 10ms"
            type="button"
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <input
            aria-label="自定义时间偏移 (毫秒)"
            className="batch-timing-input"
            disabled={draftLines.length === 0}
            type="number"
            value={batchOffset}
            onChange={(event) => {
              const next = Number(event.target.value) || 0
              const delta = next - batchOffset
              if (delta === 0) return
              setBatchOffset(next)
              onBatchAdjustTiming(delta)
            }}
          />
          <small>ms</small>
          <button
            aria-label="增加 10ms"
            className="icon-command"
            disabled={draftLines.length === 0}
            onClick={() => {
              const delta = 10
              setBatchOffset((o) => o + delta)
              onBatchAdjustTiming(delta)
            }}
            title="所有字幕增加 10ms"
            type="button"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
          <button
            aria-label="增加 500ms"
            className="icon-command"
            disabled={draftLines.length === 0}
            onClick={() => {
              const delta = 500
              setBatchOffset((o) => o + delta)
              onBatchAdjustTiming(delta)
            }}
            title="所有字幕增加 500ms"
            type="button"
          >
            <ChevronsRight size={14} aria-hidden="true" />
          </button>
          <button
            className="mini-command secondary"
            disabled={batchOffset === 0 || draftLines.length === 0}
            onClick={() => {
              if (batchOffset === 0) return
              onBatchAdjustTiming(-batchOffset)
              setBatchOffset(0)
            }}
            title="重置为 0"
            type="button"
          >
            重置
          </button>
        </div>
        <button
          className="mini-command secondary"
          disabled={!sourceUrl}
          onClick={() => onAddLine()}
          type="button"
        >
          <ListPlus size={14} aria-hidden="true" />
          新增字幕
        </button>
        <button
          className="mini-command secondary"
          disabled={!onMergeLine || activeLineIndex < 0 || activeLineIndex >= draftLines.length - 1}
          onClick={() => onMergeLine?.(activeLineIndex)}
          title="将当前选中的字幕与下一句合并"
          type="button"
        >
          <Merge size={14} aria-hidden="true" />
          与下一句合并
        </button>
        <div className="translate-control" role="group" aria-label="AI 字幕翻译">
          <button
            className="mini-command"
            disabled={!sourceUrl || isTranslating || !onTranslate}
            onClick={() => onTranslate?.('empty')}
            title="为所有语言（中文/ไทย/日本語）补齐缺失的译文"
            type="button"
          >
            <Languages size={14} aria-hidden="true" />
            {isTranslating ? '翻译中...' : 'AI 翻译'}
          </button>
          <button
            className="mini-command secondary"
            disabled={!sourceUrl || isTranslating || !onTranslate}
            onClick={() => {
              if (
                window.confirm(
                  '「全部重译」会覆盖所有语言（中文/ไทย/日本語）已填写的译文，确定继续吗？',
                )
              ) {
                onTranslate?.('all')
              }
            }}
            title="对所有语言重新翻译所有行（覆盖已有译文）"
            type="button"
          >
            全部重译
          </button>
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
          <div ref={timelineContainerRef} className="wavesurfer-timeline" />
        </div>
        {waveform.status === 'error' ? (
          <div className={`waveform-placeholder ${waveform.status}`}>
            {waveform.message}
          </div>
        ) : null}
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
      <details className="subtitle-list-panel">
        <summary>
          <span>字幕列表</span>
          <strong>{draftLines.length} 条</strong>
        </summary>
        <div className="subtitle-list-table" role="table" aria-label="字幕列表">
          <div className="subtitle-list-row subtitle-list-head" role="row">
            <span role="columnheader">序号</span>
            <span role="columnheader">开始</span>
            <span role="columnheader">结束</span>
            <span role="columnheader">时长</span>
            <span role="columnheader">字幕内容</span>
            <span role="columnheader">中文</span>
            <span role="columnheader">ไทย</span>
            <span role="columnheader">日本語</span>
            <span role="columnheader">可接受答案</span>
          </div>
          {draftLines.map((line, index) => {
            const lineDuration = Math.max(0, line.end - line.start)
            return (
              <button
                className={
                  index === activeLineIndex
                    ? 'subtitle-list-row active'
                    : 'subtitle-list-row'
                }
                key={line.id}
                onClick={() => onActiveLineChange(index)}
                role="row"
                type="button"
              >
                <span role="cell">{index + 1}</span>
                <span role="cell">{formatTimeWithMilliseconds(line.start)}</span>
                <span role="cell">{formatTimeWithMilliseconds(line.end)}</span>
                <span role="cell">{formatTimeWithMilliseconds(lineDuration)}</span>
                <span role="cell">{line.text || '未填写字幕'}</span>
                {TRANSLATION_TARGET_LOCALES.map((locale) => (
                  <span role="cell" key={locale}>
                    {line.translations[locale] || '未填写'}
                  </span>
                ))}
                <span role="cell">
                  {(line.answers ?? []).map((answer) => answer.trim()).filter(Boolean).join(' / ') ||
                    '无'}
                </span>
              </button>
            )
          })}
        </div>
      </details>
    </div>
  )
}
