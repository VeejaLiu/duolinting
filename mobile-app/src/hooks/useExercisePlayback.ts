import { analytics } from '@/lib/analytics'
import TimedPlayback from '../../modules/timed-playback'
import { coursePlaybackKey } from '@duolinting/domain'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ListeningExercise, TranscriptLine } from '@duolinting/domain'
import { createPlaybackController, secondsToUs, type PlaybackSession } from '@duolinting/playback'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useVideoPlayer, type VideoSource, type VideoTrack } from 'expo-video'
import { AppState, Platform } from 'react-native'
import { apiClient } from '@/lib/apiClient'
import { createExpoPlaybackAdapter, isReleasedPlayerError } from '@/lib/expoPlaybackAdapter'

type UseExercisePlaybackOptions = { exercise?: ListeningExercise; playbackRate: number }

const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9

const videoTrackAspectRatio = (track: VideoTrack | null | undefined) => {
  const width = Number(track?.size.width)
  const height = Number(track?.size.height)

  // Expo 的轨道尺寸以视频像素为单位；宽除以高得到 React Native
  // aspectRatio 所需的无单位比值。元数据尚未加载时先用 16:9，避免布局崩塌。
  return width > 0 && height > 0 ? width / height : DEFAULT_VIDEO_ASPECT_RATIO
}

export function useExercisePlayback({ exercise, playbackRate }: UseExercisePlaybackOptions) {
  const source = useMemo(() => exercise?.audioUrl ? apiClient.resolveApiUrl(exercise.audioUrl) : null, [exercise?.audioUrl])
  const kind = exercise?.mediaType ?? 'audio'
  const sourceKey = source && exercise ? coursePlaybackKey(exercise) : ''
  const sourceRef = useRef(sourceKey)
  sourceRef.current = sourceKey
  const videoSource = useMemo<VideoSource>(() => kind === 'video' && source ? { uri: source } : null, [kind, source])
  // 按媒体类型加载一个源，避免音频会话竞争和重复下载。
  const audioPlayer = useAudioPlayer(kind === 'audio' ? source : null, { updateInterval: 100, keepAudioSessionActive: true })
  const audioStatus = useAudioPlayerStatus(audioPlayer)
  const videoPlayer = useVideoPlayer(videoSource, (player) => { player.timeUpdateEventInterval = 0.25 })
  const adapter = useMemo(() => createExpoPlaybackAdapter(audioPlayer, videoPlayer, kind, () => sourceRef.current),
    [audioPlayer, videoPlayer, kind])
  const controller = useMemo(() => createPlaybackController(adapter), [adapter])
  const sessionRef = useRef<PlaybackSession | null>(null)
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false)
  const [playbackError, setPlaybackError] = useState(false)
  const [videoState, setVideoState] = useState({ currentTime: 0, duration: 0, playing: false })
  const [videoAspectRatio, setVideoAspectRatio] = useState(DEFAULT_VIDEO_ASPECT_RATIO)

  useEffect(() => {
    audioPlayer.shouldCorrectPitch = true
    audioPlayer.setPlaybackRate(playbackRate)
    videoPlayer.preservesPitch = true
    videoPlayer.playbackRate = playbackRate
  }, [audioPlayer, videoPlayer, playbackRate])

  useEffect(() => {
    const sync = () => {
      if (kind !== 'video') return
      try {
        const snapshot = adapter.snapshot()
        setVideoState({ currentTime: snapshot.positionUs / 1_000_000, duration: snapshot.durationUs / 1_000_000, playing: snapshot.playing })
      } catch (error) { if (!isReleasedPlayerError(error)) setPlaybackError(true) }
    }
    const subscriptions = [
      videoPlayer.addListener('timeUpdate', sync),
      videoPlayer.addListener('playingChange', sync),
      videoPlayer.addListener('sourceLoad', ({ availableVideoTracks }) => {
        sync()
        setVideoAspectRatio(videoTrackAspectRatio(videoPlayer.videoTrack ?? availableVideoTracks[0]))
      }),
      videoPlayer.addListener('videoTrackChange', ({ videoTrack }) => {
        setVideoAspectRatio(videoTrackAspectRatio(videoTrack))
      }),
    ]
    // 监听器挂载前媒体可能已命中缓存并完成轨道选择，先读一次当前值避免错过事件。
    setVideoAspectRatio(videoTrackAspectRatio(kind === 'video' ? videoPlayer.videoTrack : null))
    return () => subscriptions.forEach((subscription) => subscription.remove())
  }, [adapter, kind, sourceKey, videoPlayer])

  const pause = useCallback(() => {
    sessionRef.current = null
    controller.cancel('paused')
    setActiveLineId(null)
    setIsPreparingPlayback(false)
    setVideoState((current) => ({ ...current, playing: false }))
  }, [controller])

  useEffect(() => {
    setActiveLineId(null)
    setIsPreparingPlayback(false)
    setPlaybackError(false)
    return () => { sessionRef.current = null; controller.cancel() }
  }, [controller, sourceKey])

  useEffect(() => {
    if (exercise) void analytics.setCourse(Number(exercise.id), exercise.mediaType, exercise.lines)
    const timer = setInterval(() => {
      try { const snapshot = adapter.snapshot(); analytics.sample(snapshot.positionUs / 1000, AppState.currentState === 'active' && snapshot.playing, snapshot.buffering && AppState.currentState === 'active', playbackRate) } catch { /* Released player. */ }
    }, 250)
    const flush = setInterval(() => void analytics.flush(), 15000)
    return () => { clearInterval(timer); clearInterval(flush); analytics.endStudy() }
  }, [adapter, exercise, playbackRate])

  const track = useCallback(async (session: PlaybackSession, lineId: string | null, onEnded?: () => void, requestedPosition?: number) => {
    analytics.beginAttempt(requestedPosition ?? exercise?.lines.find(line => line.id === lineId)?.start ?? 0, lineId || requestedPosition !== undefined ? 'sentence' : 'first')
    sessionRef.current = session
    setActiveLineId(lineId)
    setPlaybackError(false)
    setIsPreparingPlayback(true)
    void session.finished.then((result) => {
      if (sessionRef.current !== session) return
      analytics.finishAttempt(result.reason)
      sessionRef.current = null
      setActiveLineId(null)
      setIsPreparingPlayback(false)
      setVideoState((current) => ({ ...current, playing: false }))
      if (result.reason === 'failed' || result.reason === 'timeout') setPlaybackError(true)
      // 只有真实到达句尾才进入学习完成/下一轮逻辑。
      if (result.reason === 'range-ended') onEnded?.()
    })
    const started = await session.started
    if (sessionRef.current !== session) return undefined
    setIsPreparingPlayback(false)
    if (started.reason !== 'started') return undefined
    if (kind === 'video') setVideoState((current) => ({ ...current, playing: true }))
    return () => session.cancel()
  }, [kind, exercise])

  const playAll = useCallback(() => {
    if (!sourceRef.current) return
    let restart = false
    try { const state = adapter.snapshot(); restart = state.ended || (state.durationUs > 0 && state.positionUs >= state.durationUs) } catch { return }
    void track(controller.play({ sourceKey: sourceRef.current, startUs: restart ? 0 : undefined }), null)
  }, [adapter, controller, track])

  const togglePlayAll = useCallback(() => {
    try { if (adapter.snapshot().playing) pause(); else playAll() } catch { setPlaybackError(true) }
  }, [adapter, pause, playAll])

  const seekTo = useCallback(async (seconds: number) => {
    let playing = false
    try { playing = adapter.snapshot().playing } catch { return }
    if (playing) await track(controller.play({ sourceKey: sourceRef.current, startUs: secondsToUs(seconds) }), null, undefined, seconds)
    else {
      sessionRef.current = null
      setActiveLineId(null)
      const result = await controller.seek(sourceRef.current, secondsToUs(seconds)).started
      if (result.reason === 'failed' || result.reason === 'timeout') setPlaybackError(true)
    }
  }, [adapter, controller, track])

  const playRangeSession = useCallback((line: TranscriptLine, count = 1) => controller.repeat({ sourceKey: sourceRef.current,
    startUs: secondsToUs(line.start), endUs: secondsToUs(line.end) }, count), [controller])
  const playLine = useCallback((line: TranscriptLine, options?: { onEnded?: () => void }) =>
    track(playRangeSession(line), line.id, options?.onEnded), [playRangeSession, track])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        controller.cancel('interrupted')
        setIsPreparingPlayback(false)
      }
    })
    return () => subscription.remove()
  }, [controller])

  return {
    currentTime: kind === 'video' ? videoState.currentTime : audioStatus.currentTime,
    duration: kind === 'video' ? videoState.duration : audioStatus.duration,
    isPlaying: kind === 'video' ? videoState.playing : audioStatus.playing,
    videoAspectRatio,
    nativePlaybackAvailable: Platform.OS === 'web' || Boolean(TimedPlayback),
    activeLineId, isPreparingPlayback, playbackError, pause, playAll, playLine, playRangeSession, seekTo, togglePlayAll, videoPlayer,
  }
}
