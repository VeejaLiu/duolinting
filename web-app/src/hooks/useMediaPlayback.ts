import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPlaybackController, secondsToUs, type PlaybackResult, type PlaybackSession } from '@duolinting/playback'
import { createWebPlaybackAdapter } from '@duolinting/playback/web'

type UseMediaPlaybackOptions = {
  mediaRef: RefObject<HTMLMediaElement | null>
  sourceKey: string
  playbackRate: number
}

export function useMediaPlayback({ mediaRef, sourceKey, playbackRate }: UseMediaPlaybackOptions) {
  const mediaElement = mediaRef.current
  const sourceRef = useRef(sourceKey)
  sourceRef.current = sourceKey
  const controllerRef = useRef<ReturnType<typeof createPlaybackController> | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createPlaybackController(createWebPlaybackAdapter(() => mediaRef.current, () => sourceRef.current))
  }
  const controller = controllerRef.current
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [completion, setCompletion] = useState<{ sourceKey: string; result: PlaybackResult } | null>(null)
  const [playbackError, setPlaybackError] = useState(false)
  const latestSessionRef = useRef<PlaybackSession | null>(null)
  const taskIdRef = useRef(0)
  const busyRef = useRef(false)

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    const sync = () => {
      setIsPlaying(!media.paused && !media.ended)
      setCurrentTime(Number.isFinite(media.currentTime) ? media.currentTime : 0)
      setDuration(Number.isFinite(media.duration) ? media.duration : 0)
    }
    const events = ['play', 'pause', 'ended', 'timeupdate', 'seeked', 'loadedmetadata', 'durationchange'] as const
    events.forEach((event) => media.addEventListener(event, sync))
    sync()
    return () => events.forEach((event) => media.removeEventListener(event, sync))
  }, [mediaElement, mediaRef, sourceKey])
  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = playbackRate
      mediaRef.current.preservesPitch = true
    }
  }, [mediaElement, mediaRef, playbackRate, sourceKey])
  useEffect(() => () => {
    taskIdRef.current += 1
    busyRef.current = false
    controller.cancel()
  }, [controller, sourceKey])

  const stopPlayback = () => {
    taskIdRef.current += 1
    busyRef.current = false
    controller.cancel()
    window.speechSynthesis?.cancel()
    setIsPlaying(false)
  }
  const watch = (session: PlaybackSession) => {
    latestSessionRef.current = session
    setPlaybackError(false)
    const source = sourceRef.current
    void session.finished.then((result) => {
      if (latestSessionRef.current !== session || sourceRef.current !== source) return
      setPlaybackError(result.reason === 'failed' || result.reason === 'timeout')
      setCompletion({ sourceKey: source, result })
    })
    return session
  }
  const playRangeSession = (start: number, end?: number) => {
    if (mediaRef.current) mediaRef.current.playbackRate = playbackRate
    return watch(controller.play({ sourceKey: sourceRef.current, startUs: secondsToUs(start),
      endUs: end === undefined ? undefined : secondsToUs(end) }))
  }
  // 学习流程等待“完成”，取消/暂停/失败也会结束等待，但不伪装成正常播完。
  const playMediaRange = (start: number, end?: number) => playRangeSession(start, end).finished
  const playMedia = async (startAt?: number) => {
    const media = mediaRef.current
    if (!media) return false
    media.playbackRate = playbackRate
    const source = sourceRef.current
    const start = startAt ?? (media.ended ? 0 : undefined)
    const session = watch(controller.play({ sourceKey: source, startUs: start === undefined ? undefined : secondsToUs(start) }))
    return (await session.started).reason === 'started'
  }
  const pauseMedia = () => {
    taskIdRef.current += 1
    busyRef.current = false
    controller.cancel('paused')
  }
  const toggleMediaPlayback = async (options?: { restartAt?: number }) => {
    const media = mediaRef.current
    if (!media) return
    if (!media.paused && !media.ended) pauseMedia()
    else await playMedia(options?.restartAt)
  }
  const seekMedia = (time: number) => {
    const media = mediaRef.current
    if (!media) return
    const target = secondsToUs(Math.max(0, Math.min(time, Number.isFinite(media.duration) ? media.duration : time)))
    if (!media.paused && !media.ended) void playMedia(target / 1_000_000)
    else watch(controller.seek(sourceRef.current, target))
  }
  const runPlayback = async (task: () => Promise<PlaybackResult>) => {
    if (busyRef.current) return false
    const id = ++taskIdRef.current
    busyRef.current = true
    window.speechSynthesis?.cancel()
    try {
      const result = await task()
      return id === taskIdRef.current && (result.reason === 'range-ended' || result.reason === 'media-ended')
    } finally {
      if (id === taskIdRef.current) busyRef.current = false
    }
  }
  return { currentTime, duration, isPlaying, completion, playbackError, pauseMedia, playMediaRange, playRangeSession,
    playMedia, runPlayback, seekMedia, stopPlayback, toggleMediaPlayback }
}
