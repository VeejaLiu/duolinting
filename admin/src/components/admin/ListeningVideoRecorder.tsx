import { Expand, Play, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Cascader, Select, Tag } from 'antd'
import type {
  CatalogExerciseSummary,
  ContentLocale,
  ExerciseCategory,
  ListeningExercise,
  MaterialCategory,
  TranscriptLine,
} from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'

type ListeningVideoRecorderProps = {
  adminToken: string
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  exercises: CatalogExerciseSummary[]
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

type RecordingPhase = 'idle' | 'countdown' | 'blind-listen' | 'show-transcript' | 'complete'

const START_COUNTDOWN_SECONDS = 3
// 每次播放与下一步骤之间留出很短的呼吸时间，避免听感紧贴，同时保持录制节奏紧凑。
const PLAYBACK_GAP_MS = 300

const recorderLocales: ContentLocale[] = ['en-US', 'zh-CN', 'th-TH', 'ja-JP']

const recorderLocaleLabels: Record<ContentLocale, string> = {
  'en-US': 'English',
  'zh-CN': '中文',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
}

const recorderMessages: Record<ContentLocale, Record<RecordingPhase | 'idleDescription' | 'listenHint' | 'listenPrompt' | 'completeHint' | 'brandTagline' | 'webAppUrl' | 'mobileAppUrl', string>> = {
  'en-US': {
    idle: 'Ready to begin',
    countdown: 'Recording starts soon',
    'blind-listen': 'Listen twice',
    'show-transcript': 'Listen once with subtitles',
    complete: 'Lesson complete',
    idleDescription: 'Each sentence plays twice without subtitles, then once with subtitles.',
    listenHint: 'Listen for the sounds and phrases you can catch.',
    listenPrompt: 'Listen first, no subtitles',
    completeHint: 'Sentence practice complete',
    brandTagline: 'Open-source, non-profit English learning',
    webAppUrl: 'Web · https://app.duolinting.cn',
    mobileAppUrl: 'Mobile · https://mobile.duolinting.cn',
  },
  'zh-CN': {
    idle: '准备开始',
    countdown: '即将开始录制',
    'blind-listen': '先听两遍',
    'show-transcript': '看字幕听一遍',
    complete: '本节精听完成',
    idleDescription: '开始后，每句会先隐藏字幕听两遍，再显示字幕听一遍。',
    listenHint: '留意你能捕捉到的声音和词组。',
    listenPrompt: '先听，不看字幕',
    completeHint: '本节逐句精听已完成',
    brandTagline: '开源非盈利 · 英语学习应用',
    webAppUrl: '网页端 · https://app.duolinting.cn',
    mobileAppUrl: '移动端 · https://mobile.duolinting.cn',
  },
  'th-TH': {
    idle: 'พร้อมเริ่ม',
    countdown: 'กำลังจะเริ่มบันทึก',
    'blind-listen': 'ฟังสองรอบ',
    'show-transcript': 'ฟังพร้อมคำบรรยายหนึ่งรอบ',
    complete: 'เรียนจบบทแล้ว',
    idleDescription: 'แต่ละประโยคจะเล่นสองครั้งโดยไม่มีคำบรรยาย แล้วเล่นอีกครั้งพร้อมคำบรรยาย',
    listenHint: 'ตั้งใจฟังเสียงและวลีที่คุณจับได้',
    listenPrompt: 'ฟังก่อน ไม่ดูคำบรรยาย',
    completeHint: 'ฝึกทีละประโยคเสร็จแล้ว',
    brandTagline: 'แอปเรียนอังกฤษโอเพนซอร์ส ไม่แสวงกำไร',
    webAppUrl: 'เว็บ · https://app.duolinting.cn',
    mobileAppUrl: 'มือถือ · https://mobile.duolinting.cn',
  },
  'ja-JP': {
    idle: '準備完了',
    countdown: 'まもなく録画開始',
    'blind-listen': '字幕なしで2回聞く',
    'show-transcript': '字幕ありで1回聞く',
    complete: 'レッスン完了',
    idleDescription: '各文を字幕なしで2回、字幕ありで1回聞きます。',
    listenHint: '聞き取れた音やフレーズに注目しましょう。',
    listenPrompt: 'まず聞く、字幕は見ない',
    completeHint: '文ごとの練習が完了しました',
    brandTagline: 'オープンソース・非営利の英語学習アプリ',
    webAppUrl: 'Web版 · https://app.duolinting.cn',
    mobileAppUrl: 'モバイル版 · https://mobile.duolinting.cn',
  },
}

/**
 * 录制台直接消费课程的绝对时间轴。每次播放前都 seek 到字幕 start，
 * 因此不会累积浏览器计时误差，也不需要预先把音频切割成很多小文件。
 */
export function ListeningVideoRecorder({
  adminToken,
  categoryGroups,
  categories,
  exercises,
  onNotify,
}: ListeningVideoRecorderProps) {
  const [searchParams] = useSearchParams()
  // 音频、视频共用同一个时间轴控制器。视频必须由 video 元素实际渲染，
  // 不能再把 mp4 放进 audio 元素，否则录屏只有声音与封面、没有原始画面。
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const mediaBackdropRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const focusShellRef = useRef<HTMLDivElement | null>(null)
  const runIdRef = useRef(0)
  // 课程管理页会用 URL 预选一门课程；记录已处理的参数，避免它在手动切课后反复覆盖用户选择。
  const appliedUrlExerciseIdRef = useRef<string | null>(null)
  const [selectedExerciseId, setSelectedExerciseId] = useState('')
  const [exercise, setExercise] = useState<ListeningExercise | null>(null)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<RecordingPhase>('idle')
  const [activeLineIndex, setActiveLineIndex] = useState(0)
  const [countdown, setCountdown] = useState(START_COUNTDOWN_SECONDS)
  const [playbackRound, setPlaybackRound] = useState(0)
  const [contentLocale, setContentLocale] = useState<ContentLocale>('zh-CN')
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null)

  // 目录选择器展示所有已保存内容，不能因为课程仍是草稿、还没有字幕而把它隐藏。
  // 能否实际开始录制在加载完整课程后单独判断，避免“新建后找不到课程”的错觉。
  const availableCategories = useMemo(
    () => [...categories]
      .sort((left, right) => left.sortOrder - right.sortOrder),
    [categories],
  )
  const availableCategoryGroups = useMemo(
    () => [...categoryGroups]
      .sort((left, right) => left.sortOrder - right.sortOrder),
    [categoryGroups],
  )
  // 分类、系列、课程是一条完整路径，使用 Cascader 避免三个横向下拉框在窄屏相互挤压。
  const courseCascaderOptions = useMemo(() => availableCategoryGroups.map((group) => ({
    label: group.name,
    value: `group-${group.id}`,
    children: availableCategories
      .filter((category) => category.groupId === group.id)
      .map((category) => ({
        label: category.name,
        value: `category-${category.id}`,
        children: exercises
          .filter((item) => item.categoryId === category.id)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((item) => ({ label: item.title, value: String(item.id) })),
      }))
      .filter((category) => category.children.length > 0),
  })).filter((group) => group.children.length > 0), [availableCategories, availableCategoryGroups, exercises])
  const selectedCoursePath = useMemo(() => {
    const item = exercises.find((candidate) => candidate.id === Number(selectedExerciseId))
    const category = availableCategories.find((candidate) => candidate.id === item?.categoryId)
    return item && category ? [`group-${category.groupId}`, `category-${category.id}`, String(item.id)] : undefined
  }, [availableCategories, exercises, selectedExerciseId])
  const activeLine = exercise?.lines[activeLineIndex]
  const isRunning = !['idle', 'complete'].includes(phase)
  const mediaUrl = resolveApiUrl(exercise?.audioUrl)
  const isVideoExercise = exercise?.mediaType === 'video'
  const isVerticalVideo = isVideoExercise && mediaAspectRatio !== null && mediaAspectRatio < 1
  const messages = recorderMessages[contentLocale]
  // 第三遍永远保留英文原句；语言选择只决定第二行译文，不能用译文替换听力原文。
  const activeTranslationText = activeLine && contentLocale !== 'en-US'
    ? contentLocale === 'zh-CN'
      ? activeLine.translations?.['zh-CN']?.trim() || activeLine.translation.trim()
      : activeLine.translations?.[contentLocale]?.trim()
    : ''
  const translatedLineCount = exercise?.lines.filter((line) => hasLineLocale(line, contentLocale)).length ?? 0

  /**
   * 切换课程时先同步撤销旧播放脚本并清空画布数据。
   * 请求新课程详情是异步的；若等到响应返回才重置，画面会短暂出现“新选择器 + 旧字幕/倒计时”的混合状态。
   */
  const resetForExerciseChange = () => {
    runIdRef.current += 1
    mediaRef.current?.pause()
    mediaBackdropRef.current?.pause()
    setExercise(null)
    setPhase('idle')
    setActiveLineIndex(0)
    setCountdown(START_COUNTDOWN_SECONDS)
    setPlaybackRound(0)
    setMediaAspectRatio(null)
  }

  useEffect(() => {
    const exerciseId = searchParams.get('exerciseId')
    if (
      exerciseId
      && exerciseId !== appliedUrlExerciseIdRef.current
      && exercises.some((item) => item.id === Number(exerciseId))
    ) {
      appliedUrlExerciseIdRef.current = exerciseId
      if (exerciseId !== selectedExerciseId) {
        resetForExerciseChange()
      }
      setSelectedExerciseId(exerciseId)
    }
  }, [exercises, searchParams, selectedExerciseId])

  useEffect(() => {
    if (selectedExerciseId || exercises.length === 0) return
    setSelectedExerciseId(String([...exercises].sort((left, right) => left.sortOrder - right.sortOrder)[0].id))
  }, [exercises, selectedExerciseId])

  useEffect(() => {
    const exerciseId = Number(selectedExerciseId)
    resetForExerciseChange()
    if (!exerciseId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    void apiClient.getAdminExercise(exerciseId, adminToken)
      .then((result) => {
        if (!cancelled) {
          setExercise(result)
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
    mediaBackdropRef.current?.pause()
  }, [])

  const wait = (milliseconds: number, runId: number) => new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(runIdRef.current === runId), milliseconds)
  })

  const seekTo = (media: HTMLMediaElement, position: number) => new Promise<void>((resolve) => {
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
    mediaBackdropRef.current?.pause()
    setPhase('idle')
    setActiveLineIndex(0)
    setCountdown(START_COUNTDOWN_SECONDS)
    setPlaybackRound(0)
  }

  const runRecording = async () => {
    if (!exercise || !mediaRef.current) return
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setActiveLineIndex(0)
    setPlaybackRound(0)

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
      setPlaybackRound(1)
      if (!await playRange(line.start, line.end, runId)) return
      if (!await wait(PLAYBACK_GAP_MS, runId)) return
      setPlaybackRound(2)
      if (!await playRange(line.start, line.end, runId)) return
      if (!await wait(PLAYBACK_GAP_MS, runId)) return
      setPhase('show-transcript')
      setPlaybackRound(3)
      if (!await playRange(line.start, line.end, runId)) return
      if (!await wait(PLAYBACK_GAP_MS, runId)) return
    }

    if (runIdRef.current === runId) {
      setPhase('complete')
    }
  }

  const openCanvasFullscreen = () => {
    // 全屏的是外层专注容器，内部成片画布始终维持 9:16，避免横屏时拉伸原视频。
    void focusShellRef.current?.requestFullscreen?.().catch(() => {
      onNotify('无法进入专注录制模式，请检查浏览器权限设置。', 'error')
    })
  }

  const selectExercise = (exerciseId: string) => {
    if (exerciseId === selectedExerciseId) return
    resetForExerciseChange()
    setSelectedExerciseId(exerciseId)
  }

  const isTranscriptVisible = phase === 'show-transcript' || phase === 'complete'
  const playableLineCount = exercise?.lines.filter(isPlayableLine).length ?? 0
  const recordingUnavailableReason = !exercise
    ? '正在加载课程'
    : !exercise.audioUrl
      ? '该课程还没有上传媒体'
      : playableLineCount === 0
        ? '该课程还没有可播放的字幕时间轴'
        : null
  const canStartRecording = !recordingUnavailableReason
  const completedLineCount = exercise
    ? phase === 'complete'
      ? exercise.lines.length
      : Math.min(activeLineIndex + (phase === 'idle' ? 0 : 1), exercise.lines.length)
    : 0
  const progressPercentage = exercise?.lines.length
    ? Math.round((completedLineCount / exercise.lines.length) * 100)
    : 0
  const phaseRoundLabel = phase === 'blind-listen'
    ? `第 ${Math.max(playbackRound, 1)} / 2 遍`
    : phase === 'show-transcript'
      ? '第 3 / 3 遍'
      : null

  return (
    <div className="recorder-workspace">
      <header className="recorder-header">
        <div>
          <h2>视频录制</h2>
          <p>以固定竖屏画布自动播放逐句精听；在专注录制模式下框选画布即可录制成片。</p>
        </div>
        <div className="recorder-controls">
          <button className="command-button secondary" disabled={isRunning} onClick={stop} type="button">
            <RotateCcw size={15} /> 重置
          </button>
          <button className="command-button secondary" onClick={openCanvasFullscreen} type="button">
            <Expand size={15} /> 专注录制模式
          </button>
          {!isRunning && (
            <button className="command-button" disabled={!canStartRecording || loading} onClick={() => void runRecording()} type="button">
              <Play size={15} /> 开始录制
            </button>
          )}
          {isRunning && <button className="command-button secondary" onClick={stop} type="button"><Square size={15} /> 停止</button>}
        </div>
      </header>

      <section className="recorder-settings" aria-label="录制配置">
        <div className="recorder-course-picker">
          <span className="recorder-settings-label">录制课程</span>
          <Cascader
            className="recorder-course-select"
            disabled={isRunning || courseCascaderOptions.length === 0}
            onChange={(value) => {
              const courseId = value[value.length - 1]
              if (typeof courseId === 'string' && /^\d+$/.test(courseId)) selectExercise(courseId)
            }}
            options={courseCascaderOptions}
            placeholder="选择内容分类、学习系列和课程"
            value={selectedCoursePath}
          />
        </div>
        <div className="recorder-course-status" aria-live="polite">
          {exercise && <Tag color={exercise.status === 'published' ? 'green' : exercise.status === 'proofread' ? 'blue' : exercise.status === 'draft' ? 'gold' : 'default'} variant="filled">{statusLabel(exercise.status)}</Tag>}
          {exercise && <Tag color={isVideoExercise ? 'blue' : 'cyan'} variant="filled">{isVideoExercise ? '视频' : '音频'}</Tag>}
          {exercise && <span>{playableLineCount} 句可录制字幕</span>}
          {!exercise && !loading && <span>请选择课程</span>}
        </div>
        <div className="recorder-translation-control">
          <div>
            <strong>成片语言</strong>
            <span>{contentLocale === 'en-US' ? '仅显示英文原句' : `英文原句 + ${translatedLineCount} / ${exercise?.lines.length ?? 0} 句译文`}</span>
          </div>
          <Select
            className="recorder-locale-select"
            disabled={isRunning}
            onChange={(value) => setContentLocale(value as ContentLocale)}
            options={recorderLocales.map((locale) => ({ label: recorderLocaleLabels[locale], value: locale }))}
            value={contentLocale}
          />
        </div>
        {recordingUnavailableReason && <span className="recorder-readiness-warning">{recordingUnavailableReason}</span>}
      </section>

      <div className="recorder-stage-area" ref={focusShellRef}>
        <div className="recorder-canvas" ref={canvasRef}>
          <header className="recorder-canvas-top">
            <div className="recorder-brand">
              <span className="recorder-brand-logo">
                <img alt="DuolinTing" src="/duolinting-logo-ear.png" />
              </span>
              <span className="recorder-brand-copy">
                <strong aria-label="DuolinTing" className="recorder-brand-title">
                  {'DuolinTing'.split('').map((letter, index) => (
                    <span key={`${letter}-${index}`} style={{ '--brand-letter-index': index } as CSSProperties}>{letter}</span>
                  ))}
                </strong>
                <small>{messages.brandTagline}</small>
                <span aria-label={`${messages.webAppUrl}，${messages.mobileAppUrl}`} className="recorder-brand-url-ticker">
                  <span className="recorder-brand-url-track">
                    <span>{messages.webAppUrl}</span>
                    <span aria-hidden="true">{messages.mobileAppUrl}</span>
                    {/* 重复首项让上下切换循环时不出现空白。 */}
                    <span aria-hidden="true">{messages.webAppUrl}</span>
                  </span>
                </span>
              </span>
            </div>
            <span className="recorder-course-progress">{exercise ? `${completedLineCount} / ${exercise.lines.length}` : '0 / 0'}</span>
          </header>

          <main className="recorder-canvas-body">
            <div
              className={isVideoExercise ? `recorder-media-frame is-video${isVerticalVideo ? ' is-vertical' : ''}` : 'recorder-media-frame is-audio'}
              style={isVideoExercise && mediaAspectRatio && !isVerticalVideo ? { aspectRatio: String(mediaAspectRatio) } : undefined}
            >
              {isVideoExercise && mediaUrl && (
                <>
                  {isVerticalVideo && (
                    <video
                      aria-hidden="true"
                      className="recorder-video-blur"
                      muted
                      playsInline
                      preload="auto"
                      ref={mediaBackdropRef}
                      src={mediaUrl}
                    />
                  )}
                  <video
                    ref={(node) => { mediaRef.current = node }}
                    className="recorder-video"
                    onLoadedMetadata={(event) => {
                      const { videoHeight, videoWidth } = event.currentTarget
                      if (videoWidth > 0 && videoHeight > 0) setMediaAspectRatio(videoWidth / videoHeight)
                    }}
                    onPause={() => mediaBackdropRef.current?.pause()}
                    onPlay={() => {
                      const backdrop = mediaBackdropRef.current
                      if (!backdrop) return
                      void backdrop.play().catch(() => undefined)
                    }}
                    onSeeked={(event) => {
                      const backdrop = mediaBackdropRef.current
                      if (backdrop) backdrop.currentTime = event.currentTarget.currentTime
                    }}
                    onTimeUpdate={(event) => {
                      const backdrop = mediaBackdropRef.current
                      // 后景只提供柔和氛围，允许极小误差；超过 150ms 时才纠正，避免频繁 seek。
                      if (backdrop && Math.abs(backdrop.currentTime - event.currentTarget.currentTime) > .15) {
                        backdrop.currentTime = event.currentTarget.currentTime
                      }
                    }}
                    playsInline
                    poster={exercise?.coverImageUrl ? resolveApiUrl(exercise.coverImageUrl) : undefined}
                    preload="auto"
                    src={mediaUrl}
                  />
                </>
              )}
              {!isVideoExercise && exercise?.coverImageUrl && (
                <>
                  {/* 模糊层只用于填充横向媒体窗；清晰封面始终按原始比例显示在上层。 */}
                  <img alt="" aria-hidden="true" className="recorder-cover-blur" src={resolveApiUrl(exercise.coverImageUrl)} />
                  <img alt="课程封面" className="recorder-cover-image" src={resolveApiUrl(exercise.coverImageUrl)} />
                </>
              )}
              {!isVideoExercise && !exercise?.coverImageUrl && (
                <div className="recorder-audio-placeholder" aria-hidden="true"><span /></div>
              )}
              {phase === 'countdown' && <strong className="recorder-countdown">{countdown}</strong>}
            </div>

            <section className="recorder-learning-panel" aria-live="polite">
              <div className="recorder-phase-row">
                <span className={`recorder-phase-badge phase-${phase}`}>{messages[phase]}</span>
                {phaseRoundLabel && <span className="recorder-round-label">{phaseRoundLabel}</span>}
              </div>

              {phase === 'countdown' && <p className="recorder-stage-copy">{messages.countdown}</p>}
              {phase === 'idle' && (
                <>
                  <p className="recorder-course-title">{exercise?.title ?? '请选择一节课程'}</p>
                  <p className="recorder-stage-copy">{messages.idleDescription}</p>
                </>
              )}
              {phase === 'blind-listen' && <div className="recorder-listening-prompt"><strong>{messages.listenPrompt}</strong><span>{messages.listenHint}</span></div>}
              {isTranscriptVisible && activeLine && (
                <div className="recorder-transcript" key={activeLine.id}>
                  <strong>{activeLine.text}</strong>
                  {activeTranslationText && <span>{activeTranslationText}</span>}
                </div>
              )}
              {phase === 'show-transcript' && <p className="recorder-stage-copy">{messages['show-transcript']}</p>}
              {phase === 'complete' && <p className="recorder-stage-copy recorder-complete-copy">{messages.completeHint}</p>}
            </section>
          </main>

          <footer className="recorder-canvas-footer">
            <div aria-label={`课程进度 ${progressPercentage}%`} className="recorder-progress-track">
              <span style={{ width: `${progressPercentage}%` }} />
            </div>
            <span>逐句精听</span>
          </footer>
        </div>
      </div>
      {!isVideoExercise && mediaUrl && <audio ref={(node) => { mediaRef.current = node }} preload="auto" src={mediaUrl} />}
    </div>
  )
}

const isPlayableLine = (line: TranscriptLine) => Boolean(line.text.trim()) && line.end > line.start && line.start >= 0

const hasLineLocale = (line: TranscriptLine, locale: ContentLocale) => {
  if (locale === 'en-US') return Boolean(line.text.trim())
  if (locale === 'zh-CN') return Boolean(line.translations?.['zh-CN']?.trim() || line.translation.trim())
  return Boolean(line.translations?.[locale]?.trim())
}

const statusLabel = (status: ListeningExercise['status']) => ({
  draft: '草稿',
  proofread: '已校对',
  published: '已发布',
  archived: '已归档',
})[status]
