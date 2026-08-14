import { Expand, Play, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CatalogExerciseSummary, ListeningExercise, TranscriptLine } from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'

type ListeningVideoRecorderProps = {
  adminToken: string
  exercises: CatalogExerciseSummary[]
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

type RecordingPhase = 'idle' | 'countdown' | 'blind-listen' | 'show-transcript' | 'complete'

const START_COUNTDOWN_SECONDS = 3
const REPEAT_GAP_MS = 300
const TRANSCRIPT_REVEAL_GAP_MS = 700
const SENTENCE_GAP_MS = 800

const phaseLabels: Record<RecordingPhase, string> = {
  idle: '准备开始',
  countdown: '即将开始录制',
  'blind-listen': '先听两遍',
  'show-transcript': '看字幕再听两遍',
  complete: '本节精听完成',
}

/**
 * 录制台直接消费课程的绝对时间轴。每次播放前都 seek 到字幕 start，
 * 因此不会累积浏览器计时误差，也不需要预先把音频切割成很多小文件。
 */
export function ListeningVideoRecorder({
  adminToken,
  exercises,
  onNotify,
}: ListeningVideoRecorderProps) {
  const [searchParams] = useSearchParams()
  const mediaRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const runIdRef = useRef(0)
  const [selectedExerciseId, setSelectedExerciseId] = useState('')
  const [exercise, setExercise] = useState<ListeningExercise | null>(null)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<RecordingPhase>('idle')
  const [activeLineIndex, setActiveLineIndex] = useState(0)
  const [countdown, setCountdown] = useState(START_COUNTDOWN_SECONDS)
  const [showTranslation, setShowTranslation] = useState(false)

  const recordableExercises = useMemo(
    () => exercises.filter((item) => item.status === 'published' && item.audioUrl && item.lineCount > 0),
    [exercises],
  )
  const activeLine = exercise?.lines[activeLineIndex]
  const isRunning = !['idle', 'complete'].includes(phase)
  const mediaUrl = resolveApiUrl(exercise?.audioUrl)

  useEffect(() => {
    const exerciseId = searchParams.get('exerciseId')
    if (exerciseId && recordableExercises.some((item) => item.id === Number(exerciseId))) {
      setSelectedExerciseId(exerciseId)
    }
  }, [recordableExercises, searchParams])

  useEffect(() => {
    if (!selectedExerciseId && recordableExercises[0]) {
      setSelectedExerciseId(String(recordableExercises[0].id))
    }
  }, [recordableExercises, selectedExerciseId])

  useEffect(() => {
    const exerciseId = Number(selectedExerciseId)
    if (!exerciseId) {
      setExercise(null)
      return
    }

    let cancelled = false
    setLoading(true)
    void apiClient.getAdminExercise(exerciseId, adminToken)
      .then((result) => {
        if (!cancelled) {
          setExercise(result)
          setActiveLineIndex(0)
          setPhase('idle')
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setExercise(null)
          onNotify(`课程加载失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [adminToken, onNotify, selectedExerciseId])

  useEffect(() => () => {
    runIdRef.current += 1
    mediaRef.current?.pause()
  }, [])

  const wait = (milliseconds: number, runId: number) => new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(runIdRef.current === runId), milliseconds)
  })

  const seekTo = (media: HTMLAudioElement, position: number) => new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timeoutId)
      media.removeEventListener('seeked', finish)
      resolve()
    }
    // 某些浏览器在目标位置已缓存时不会派发 seeked；超时兜底保证录制脚本不会卡住。
    const timeoutId = window.setTimeout(finish, 800)
    media.addEventListener('seeked', finish, { once: true })
    media.currentTime = Math.max(0, position)
    if (!media.seeking) finish()
  })

  const playRange = (start: number, end: number | undefined, runId: number) => new Promise<boolean>((resolve) => {
    const media = mediaRef.current
    if (!media || runIdRef.current !== runId) {
      resolve(false)
      return
    }

    let frameId = 0
    let finished = false
    const finish = (completed: boolean) => {
      if (finished) return
      finished = true
      window.cancelAnimationFrame(frameId)
      media.removeEventListener('ended', onEnded)
      media.removeEventListener('error', onError)
      resolve(completed && runIdRef.current === runId)
    }
    const onEnded = () => finish(true)
    const onError = () => finish(false)
    const checkEnd = () => {
      if (runIdRef.current !== runId || media.paused) {
        finish(false)
        return
      }
      if (end !== undefined && media.currentTime >= end) {
        media.pause()
        media.currentTime = end
        finish(true)
        return
      }
      frameId = window.requestAnimationFrame(checkEnd)
    }

    const begin = async () => {
      media.pause()
      await seekTo(media, start)
      if (runIdRef.current !== runId) {
        finish(false)
        return
      }
      try {
        await media.play()
        if (runIdRef.current !== runId) {
          media.pause()
          finish(false)
          return
        }
        media.addEventListener('ended', onEnded, { once: true })
        media.addEventListener('error', onError, { once: true })
        if (end === undefined) {
          return
        }
        frameId = window.requestAnimationFrame(checkEnd)
      } catch {
        finish(false)
      }
    }
    void begin()
  })

  const stop = () => {
    runIdRef.current += 1
    mediaRef.current?.pause()
    setPhase('idle')
    setActiveLineIndex(0)
    setCountdown(START_COUNTDOWN_SECONDS)
  }

  const runRecording = async () => {
    if (!exercise || !mediaRef.current) return
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setActiveLineIndex(0)

    for (let remaining = START_COUNTDOWN_SECONDS; remaining > 0; remaining -= 1) {
      if (runIdRef.current !== runId) return
      setPhase('countdown')
      setCountdown(remaining)
      if (!await wait(1000, runId)) return
    }

    for (let index = 0; index < exercise.lines.length; index += 1) {
      const line = exercise.lines[index]
      if (!isPlayableLine(line)) continue
      setActiveLineIndex(index)
      setPhase('blind-listen')
      if (!await playRange(line.start, line.end, runId)) return
      if (!await wait(REPEAT_GAP_MS, runId)) return
      if (!await playRange(line.start, line.end, runId)) return
      if (!await wait(TRANSCRIPT_REVEAL_GAP_MS, runId)) return
      setPhase('show-transcript')
      if (!await playRange(line.start, line.end, runId)) return
      if (!await wait(REPEAT_GAP_MS, runId)) return
      if (!await playRange(line.start, line.end, runId)) return
      if (!await wait(SENTENCE_GAP_MS, runId)) return
    }

    if (runIdRef.current === runId) {
      setPhase('complete')
    }
  }

  const openCanvasFullscreen = () => {
    void canvasRef.current?.requestFullscreen?.().catch(() => {
      onNotify('无法进入全屏预览，请检查浏览器权限设置。', 'error')
    })
  }

  const selectExercise = (exerciseId: string) => {
    stop()
    setSelectedExerciseId(exerciseId)
  }

  const isTranscriptVisible = phase === 'show-transcript' || phase === 'complete'

  return (
    <div className="recorder-workspace">
      <header className="recorder-header">
        <div>
          <h2>视频录制</h2>
          <p>自动播放泛听与逐句精听；打开全屏后即可用系统录屏保存竖屏视频。</p>
        </div>
        <div className="recorder-controls">
          <button className="command-button secondary" disabled={isRunning} onClick={stop} type="button">
            <RotateCcw size={15} /> 重置
          </button>
          <button className="command-button secondary" onClick={openCanvasFullscreen} type="button">
            <Expand size={15} /> 全屏预览
          </button>
          {!isRunning && (
            <button className="command-button" disabled={!exercise || loading} onClick={() => void runRecording()} type="button">
              <Play size={15} /> 开始录制
            </button>
          )}
          {isRunning && <button className="command-button secondary" onClick={stop} type="button"><Square size={15} /> 停止</button>}
        </div>
      </header>

      <div className="recorder-settings">
        <label className="field">
          <span>选择课程</span>
          <select disabled={isRunning || loading} onChange={(event) => selectExercise(event.target.value)} value={selectedExerciseId}>
            {recordableExercises.length === 0 && <option value="">没有可录制课程</option>}
            {recordableExercises.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label className="recorder-checkbox">
          <input checked={showTranslation} disabled={isRunning} onChange={(event) => setShowTranslation(event.target.checked)} type="checkbox" />
          显示中文翻译
        </label>
        <p>仅显示已发布、已配置媒体且包含字幕时间轴的课程。</p>
      </div>

      <div className="recorder-stage-area">
        <div className="recorder-canvas" ref={canvasRef} style={exercise?.coverImageUrl ? { backgroundImage: `linear-gradient(rgba(10, 20, 35, .35), rgba(10, 20, 35, .82)), url("${resolveApiUrl(exercise.coverImageUrl)}")` } : undefined}>
          <div className="recorder-canvas-top"><span>DUOLINTING</span><span>{phaseLabels[phase]}</span></div>
          <main className="recorder-canvas-content">
            {phase === 'countdown' ? <strong className="recorder-countdown">{countdown}</strong> : (
              <>
                <p className="recorder-course-title">{exercise?.title ?? '请选择一节课程'}</p>
                {phase === 'blind-listen' && <p className="recorder-stage-copy">先不看字幕，专心听两遍。<br />试着捕捉你听到的每一个词。</p>}
                {isTranscriptVisible && activeLine && <div className="recorder-transcript"><strong>{activeLine.text}</strong>{showTranslation && activeLine.translation && <span>{activeLine.translation}</span>}</div>}
                {phase === 'show-transcript' && <p className="recorder-stage-copy">现在对照字幕，再听两遍。<br />注意连读、重音和你刚才漏掉的部分。</p>}
                {phase === 'complete' && <p className="recorder-stage-copy">恭喜你完成本节精听</p>}
              </>
            )}
          </main>
          <div className="recorder-canvas-footer"><span>{exercise ? `${activeLineIndex + 1} / ${exercise.lines.length}` : '0 / 0'}</span><span>逐句精听</span></div>
        </div>
      </div>
      {mediaUrl && <audio ref={mediaRef} src={mediaUrl} />}
    </div>
  )
}

const isPlayableLine = (line: TranscriptLine) => Boolean(line.text.trim()) && line.end > line.start && line.start >= 0
