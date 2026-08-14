import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ListeningExercise, TranscriptLine } from '@duolinting/domain'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useVideoPlayer, type VideoSource } from 'expo-video'
import { AppState, Platform } from 'react-native'
import { apiClient } from '@/lib/apiClient'

type UseExercisePlaybackOptions = {
  exercise?: ListeningExercise
  playbackRate: number
}

type WebAudioPlayer = {
  media?: HTMLMediaElement
}

type WebVideoPlayer = {
  _mountedVideos?: Set<HTMLMediaElement>
}

type ActivePlaybackRange = {
  token: number
  lineId: string
  mediaType: ListeningExercise['mediaType']
  start: number
  end: number
  onEnded?: () => void
}

const LINE_END_EPSILON_SECONDS = 0.04
const SEEK_TARGET_TOLERANCE_SECONDS = 0.25
// iOS seek 落地的等待时长：过短 seek 可能未完成，过长会拖慢逐句播放的响应
const VIDEO_SEEK_SETTLE_MS = 120
// 精确停止定时器的提前量：到点前重读一次真实位置再排短延时，抵消 JS 定时器误差
const RANGE_STOP_TIMER_EARLY_MS = 40

const prepareWebVideosForManualPlayback = (videos: HTMLMediaElement[]) => {
  for (const video of videos) {
    video.onplay = null
    video.onpause = null
  }
}

const shouldIgnorePlaybackError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'AbortError' || error.name === 'NotAllowedError')

const settleWebPlay = (result: void | Promise<void>) => {
  if (result && typeof result.catch === 'function') {
    result.catch((error) => {
      // AbortError / NotAllowedError 是 Web 端自动播放策略导致的正常拒绝，直接吞掉
      if (!shouldIgnorePlaybackError(error)) {
        console.error(error)
      }
    })
  }
}

// expo-audio / expo-video 的 useXxxPlayer 在组件卸载时会自行释放原生 shared
// object。卸载清理里的 pause() 若晚于释放执行，会同步抛出
// NativeSharedObjectNotFoundException（包装在 FunctionCallException 里）——
// 原生对象已释放即已停止，无需 pause，直接忽略；其余异常照常抛出。
const tryPauseNativePlayer = (player: { pause: () => void }) => {
  try {
    player.pause()
  } catch (error) {
    if (String(error).includes('NativeSharedObjectNotFoundException')) {
      return
    }
    throw error
  }
}

export function useExercisePlayback({
  exercise,
  playbackRate,
}: UseExercisePlaybackOptions) {
  const source = useMemo(() => {
    if (!exercise?.audioUrl) {
      return null
    }

    return apiClient.resolveApiUrl(exercise.audioUrl)
  }, [exercise?.audioUrl])
  // 按媒体类型只创建需要的播放器：此前 audio/video 两个播放器用同一个源
  // 同时加载，iOS 真机上 expo-audio 的音频会话管理会把 expo-video 的播放
  // 拉停（playingChange false 且无错误）。双加载也浪费一倍下载。
  const audioSource = exercise?.mediaType === 'audio' ? source : null
  const videoSource = useMemo<VideoSource>(
    () => (exercise?.mediaType === 'video' && source ? { uri: source } : null),
    [exercise?.mediaType, source],
  )
  const activeRangeRef = useRef<ActivePlaybackRange | null>(null)
  const pendingRangeRef = useRef<ActivePlaybackRange | null>(null)
  const playbackTokenRef = useRef(0)
  const preparingPlaybackTokenRef = useRef<number | null>(null)
  const loadedSourceRef = useRef<string | null>(null)
  const rangeStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false)
  const [videoPlaybackState, setVideoPlaybackState] = useState({
    currentTime: 0,
    duration: 0,
    playing: false,
  })

  const audioPlayer = useAudioPlayer(audioSource, {
    updateInterval: 100,
    // 保持音频会话常驻激活：expo-audio 的播放器（即使闲置）停用共享
    // AVAudioSession 时会把 expo-video 的播放拉停（播放约 0.5s 后无错误
    // 暂停），常驻可避免该冲突；代价是音频会话一直占用。
    keepAudioSessionActive: true,
  })
  const audioStatus = useAudioPlayerStatus(audioPlayer)
  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.timeUpdateEventInterval = 0.25
  })
  const audioPlayerRef = useRef(audioPlayer)
  const videoPlayerRef = useRef(videoPlayer)

  useEffect(() => {
    audioPlayerRef.current = audioPlayer
    videoPlayerRef.current = videoPlayer
  }, [audioPlayer, videoPlayer])

  useEffect(() => {
    // expo-audio on iOS exposes playbackRate as a getter. Its dedicated method
    // also retains the selected rate while playback is paused.
    audioPlayer.setPlaybackRate(playbackRate)
    videoPlayer.playbackRate = playbackRate
  }, [audioPlayer, playbackRate, videoPlayer])

  const getWebAudioElement = useCallback(
    () => (audioPlayer as WebAudioPlayer).media ?? null,
    [audioPlayer],
  )
  const getWebVideoElements = useCallback(
    () => Array.from((videoPlayer as WebVideoPlayer)._mountedVideos ?? []),
    [videoPlayer],
  )

  const safePauseAudio = useCallback(() => {
    tryPauseNativePlayer(audioPlayer)
  }, [audioPlayer])

  const safePauseVideo = useCallback(() => {
    setVideoPlaybackState((current) => ({
      ...current,
      currentTime: videoPlayer.currentTime ?? current.currentTime,
      duration: videoPlayer.duration ?? current.duration,
      playing: false,
    }))

    if (Platform.OS === 'web') {
      const videos = getWebVideoElements()
      prepareWebVideosForManualPlayback(videos)
      for (const video of videos) {
        video.pause()
      }
      return
    }

    tryPauseNativePlayer(videoPlayer)
  }, [getWebVideoElements, videoPlayer])

  const safePlayAudio = useCallback(() => {
    if (Platform.OS === 'web') {
      const media = getWebAudioElement()
      if (!media) {
        return
      }
      settleWebPlay(media.play())
      return
    }

    audioPlayer.play()
  }, [audioPlayer, getWebAudioElement])

  const safePlayVideo = useCallback(() => {
    setVideoPlaybackState((current) => ({
      ...current,
      currentTime: videoPlayer.currentTime ?? current.currentTime,
      duration: videoPlayer.duration ?? current.duration,
      playing: true,
    }))

    if (Platform.OS === 'web') {
      const videos = getWebVideoElements()
      const primaryVideo = videos[0]
      prepareWebVideosForManualPlayback(videos)
      for (const video of videos.slice(1)) {
        video.pause()
      }
      if (primaryVideo) {
        settleWebPlay(primaryVideo.play())
      }
      return
    }

    videoPlayer.play()
  }, [getWebVideoElements, videoPlayer])

  const startPreparingPlayback = useCallback((token: number) => {
    preparingPlaybackTokenRef.current = token
    setIsPreparingPlayback(true)
  }, [])

  const finishPreparingPlayback = useCallback((token: number) => {
    if (preparingPlaybackTokenRef.current !== token) {
      return
    }

    preparingPlaybackTokenRef.current = null
    setIsPreparingPlayback(false)
  }, [])

  const cancelPreparingPlayback = useCallback(() => {
    preparingPlaybackTokenRef.current = null
    setIsPreparingPlayback(false)
  }, [])

  const clearRangeStopTimeout = useCallback(() => {
    if (rangeStopTimeoutRef.current !== null) {
      clearTimeout(rangeStopTimeoutRef.current)
      rangeStopTimeoutRef.current = null
    }
  }, [])

  // playbackToken 是媒体任务代号；任何暂停、切源、手动 seek 都会递增它。
  // 异步 seek 完成后必须核对 token，避免旧任务在新任务之后重新开始播放。
  const pause = useCallback(() => {
    playbackTokenRef.current += 1
    activeRangeRef.current = null
    pendingRangeRef.current = null
    clearRangeStopTimeout()
    setActiveLineId(null)
    cancelPreparingPlayback()
    safePauseAudio()
    safePauseVideo()
  }, [cancelPreparingPlayback, clearRangeStopTimeout, safePauseAudio, safePauseVideo])

  useEffect(() => {
    if (loadedSourceRef.current === source) {
      return
    }

    loadedSourceRef.current = source
    if (!source) {
      playbackTokenRef.current += 1
      activeRangeRef.current = null
      pendingRangeRef.current = null
      clearRangeStopTimeout()
      setActiveLineId(null)
      preparingPlaybackTokenRef.current = null
      setIsPreparingPlayback(false)
      tryPauseNativePlayer(audioPlayerRef.current)
      if (Platform.OS === 'web') {
        const videos = Array.from(
          (videoPlayerRef.current as WebVideoPlayer)._mountedVideos ?? [],
        )
        prepareWebVideosForManualPlayback(videos)
        for (const video of videos) {
          video.pause()
        }
      } else {
        tryPauseNativePlayer(videoPlayerRef.current)
      }
      return
    }

    playbackTokenRef.current += 1
    activeRangeRef.current = null
    pendingRangeRef.current = null
    clearRangeStopTimeout()
    setActiveLineId(null)
    preparingPlaybackTokenRef.current = null
    setIsPreparingPlayback(false)
    tryPauseNativePlayer(audioPlayerRef.current)
    if (Platform.OS === 'web') {
      const videos = Array.from(
        (videoPlayerRef.current as WebVideoPlayer)._mountedVideos ?? [],
      )
      prepareWebVideosForManualPlayback(videos)
      for (const video of videos) {
        video.pause()
      }
    } else {
      tryPauseNativePlayer(videoPlayerRef.current)
    }
    // 注意：不需要在这里 replace 媒体源。useAudioPlayer/useVideoPlayer 在 source
    // 变化时会销毁并重建播放器实例（新实例自带新源）；此前这里再调一次
    // replace/replaceAsync 会导致同一源加载两次——播放中第二次加载完成会打断
    // 播放，表现为"播一下就停"。这里只负责重置播放状态和暂停旧实例。
  }, [
    audioPlayer,
    clearRangeStopTimeout,
    source,
    videoPlayer,
  ])

  const playAll = useCallback(() => {
    if (!source) {
      return
    }

    playbackTokenRef.current += 1
    activeRangeRef.current = null
    pendingRangeRef.current = null
    clearRangeStopTimeout()
    setActiveLineId(null)
    cancelPreparingPlayback()
    if (exercise?.mediaType === 'video') {
      safePauseAudio()
      safePlayVideo()
      return
    }

    safePauseVideo()
    safePlayAudio()
  }, [
    cancelPreparingPlayback,
    clearRangeStopTimeout,
    exercise?.mediaType,
    safePauseAudio,
    safePauseVideo,
    safePlayAudio,
    safePlayVideo,
    source,
  ])

  const togglePlayAll = useCallback(() => {
    if (exercise?.mediaType === 'video') {
      if (videoPlaybackState.playing) {
        pause()
      } else {
        playAll()
      }
      return
    }

    if (audioStatus.playing) {
      pause()
    } else {
      playAll()
    }
  }, [audioStatus.playing, exercise?.mediaType, pause, playAll, videoPlaybackState.playing])

  const seekTo = useCallback(
    async (seconds: number) => {
      playbackTokenRef.current += 1
      activeRangeRef.current = null
      pendingRangeRef.current = null
      clearRangeStopTimeout()
      setActiveLineId(null)
      cancelPreparingPlayback()

      if (exercise?.mediaType === 'video') {
        videoPlayer.currentTime = seconds
        setVideoPlaybackState((current) => ({
          ...current,
          currentTime: seconds,
          duration: videoPlayer.duration ?? current.duration,
        }))
        return
      }

      await audioPlayer.seekTo(seconds, 0, 0)
    },
    [audioPlayer, cancelPreparingPlayback, clearRangeStopTimeout, exercise?.mediaType, videoPlayer],
  )

  // 到达句末：停播并把播放位置对齐到精确句末。range 必须仍是当前活动区间，
  // 否则说明切句/暂停已使本次停止失效（定时器到点晚于状态变更时直接丢弃）。
  const stopActiveRange = useCallback(
    (range: ActivePlaybackRange) => {
      if (activeRangeRef.current !== range) {
        return
      }

      activeRangeRef.current = null
      pendingRangeRef.current = null
      playbackTokenRef.current += 1
      clearRangeStopTimeout()
      setActiveLineId(null)

      if (range.mediaType === 'video') {
        safePauseVideo()
        videoPlayer.currentTime = range.end
      } else {
        safePauseAudio()
        void audioPlayer.seekTo(range.end, 0, 0)
      }

      range.onEnded?.()
    },
    [audioPlayer, clearRangeStopTimeout, safePauseAudio, safePauseVideo, videoPlayer],
  )

  /*
   * 区间播放的位置事件入口（音频 100ms 轮询 / 视频 250ms timeUpdate）。
   * 停止精度策略：轮询只负责校正漂移，真正停止由 setTimeout 按
   * 「剩余时长 / 倍速」精确触发——避免停止点受轮询间隔限制（音频 100ms、
   * 视频 250ms 的多播）。定时器提前 TIMER_EARLY_MS 触发并重入本函数，
   * 用最新位置再排一个短延时，抵消 JS 定时器本身的误差。
   */
  const completeActiveRange = useCallback(
    (currentTime: number, mediaType: ListeningExercise['mediaType']) => {
      const pendingRange = pendingRangeRef.current
      if (
        pendingRange &&
        pendingRange.mediaType === mediaType &&
        Math.abs(currentTime - pendingRange.start) <= SEEK_TARGET_TOLERANCE_SECONDS
      ) {
        pendingRangeRef.current = null
        activeRangeRef.current = pendingRange
      }

      const activeRange = activeRangeRef.current
      if (
        !activeRange ||
        activeRange.mediaType !== mediaType
      ) {
        return
      }

      // 暂停状态下不排定时器：否则暂停在句中也会在到点时被误判为播完
      const isPlaying =
        mediaType === 'video'
          ? Platform.OS === 'web'
            // Web 端直接调用 <video>.play()，并清除了 expo-video 的 play/pause
            // 事件代理；此时 player.playing 不会更新，必须以真实元素状态为准。
            ? Boolean(
                getWebVideoElements().find((video) => !video.paused && !video.ended),
              )
            : Boolean(videoPlayer.playing)
          : Boolean(audioPlayer.playing)
      if (!isPlaying) {
        clearRangeStopTimeout()
        return
      }

      const remainingSeconds = activeRange.end - currentTime
      if (remainingSeconds <= LINE_END_EPSILON_SECONDS) {
        stopActiveRange(activeRange)
        return
      }

      clearRangeStopTimeout()
      const token = playbackTokenRef.current
      rangeStopTimeoutRef.current = setTimeout(
        () => {
          rangeStopTimeoutRef.current = null
          if (playbackTokenRef.current !== token || activeRangeRef.current !== activeRange) {
            return
          }
          const freshTime =
            mediaType === 'video' ? videoPlayer.currentTime : audioPlayer.currentTime
          completeActiveRange(freshTime, mediaType)
        },
        Math.max((remainingSeconds / (playbackRate > 0 ? playbackRate : 1)) * 1000 - RANGE_STOP_TIMER_EARLY_MS, 0),
      )
    },
    [
      audioPlayer,
      clearRangeStopTimeout,
      getWebVideoElements,
      playbackRate,
      stopActiveRange,
      videoPlayer,
    ],
  )

  useEffect(() => {
    const subscription = videoPlayer.addListener('timeUpdate', ({ currentTime }) => {
      const webVideos = Platform.OS === 'web' ? getWebVideoElements() : []
      if (Platform.OS === 'web') {
        prepareWebVideosForManualPlayback(webVideos)
      }
      const primaryWebVideo = webVideos[0]
      setVideoPlaybackState((current) => ({
        ...current,
        currentTime,
        duration: videoPlayer.duration ?? current.duration,
        playing:
          Platform.OS === 'web'
            ? Boolean(primaryWebVideo && !primaryWebVideo.paused && !primaryWebVideo.ended)
            : Boolean(videoPlayer.playing),
      }))
      completeActiveRange(currentTime, 'video')
    })

    return () => {
      subscription.remove()
    }
  }, [completeActiveRange, getWebVideoElements, videoPlayer])

  useEffect(() => {
    if (Platform.OS === 'web') {
      return undefined
    }

    const subscription = videoPlayer.addListener('playingChange', ({ isPlaying }) => {
      setVideoPlaybackState((current) => ({
        ...current,
        currentTime: videoPlayer.currentTime ?? current.currentTime,
        duration: videoPlayer.duration ?? current.duration,
        playing: isPlaying,
      }))
    })

    return () => {
      subscription.remove()
    }
  }, [videoPlayer])

  useEffect(() => {
    const subscription = videoPlayer.addListener('sourceLoad', ({ duration }) => {
      setVideoPlaybackState((current) => ({
        ...current,
        currentTime: videoPlayer.currentTime ?? current.currentTime,
        duration,
        playing: Boolean(videoPlayer.playing),
      }))
    })

    return () => {
      subscription.remove()
    }
  }, [videoPlayer])

  useEffect(() => {
    completeActiveRange(audioStatus.currentTime, 'audio')
  }, [audioStatus.currentTime, completeActiveRange])

  const playLine = useCallback(
    async (
      line: TranscriptLine,
      options?: {
        onEnded?: () => void
      },
    ) => {
      const playbackToken = playbackTokenRef.current + 1
      playbackTokenRef.current = playbackToken
      startPreparingPlayback(playbackToken)
      activeRangeRef.current = null
      pendingRangeRef.current = null
      clearRangeStopTimeout()
      setActiveLineId(line.id)

      try {
        if (exercise?.mediaType === 'video') {
          safePauseAudio()
          // iOS 上 seek 是异步的：seek 未落地就 play()，播放器会从旧位置
          // （常见是上次播放结束停留的文件末尾）开始，表现为"播一下就停"。
          // 先暂停再 seek（expo 官方建议），延迟一拍等 seek 落地后再播放。
          tryPauseNativePlayer(videoPlayer)
          videoPlayer.currentTime = line.start
          setVideoPlaybackState((current) => ({
            ...current,
            currentTime: line.start,
            duration: videoPlayer.duration ?? current.duration,
          }))
          await new Promise((resolve) => setTimeout(resolve, VIDEO_SEEK_SETTLE_MS))
          if (playbackTokenRef.current !== playbackToken) {
            return undefined
          }

          pendingRangeRef.current = {
            token: playbackToken,
            lineId: line.id,
            mediaType: 'video',
            start: line.start,
            end: line.end,
            onEnded: options?.onEnded,
          }
          safePlayVideo()
          return () => {
            const activeRange = activeRangeRef.current
            if (activeRange?.token === playbackToken) {
              activeRangeRef.current = null
            }
            const pendingRange = pendingRangeRef.current
            if (pendingRange?.token === playbackToken) {
              pendingRangeRef.current = null
            }
          }
        }

        safePauseVideo()
        await audioPlayer.seekTo(line.start, 0, 0)
        if (playbackTokenRef.current !== playbackToken) {
          return undefined
        }

        pendingRangeRef.current = {
          token: playbackToken,
          lineId: line.id,
          mediaType: 'audio',
          start: line.start,
          end: line.end,
          onEnded: options?.onEnded,
        }
        safePlayAudio()
        return () => {
          const activeRange = activeRangeRef.current
          if (activeRange?.token === playbackToken) {
            activeRangeRef.current = null
          }
          const pendingRange = pendingRangeRef.current
          if (pendingRange?.token === playbackToken) {
            pendingRangeRef.current = null
          }
        }
      } finally {
        finishPreparingPlayback(playbackToken)
      }
    },
    [
      audioPlayer,
      clearRangeStopTimeout,
      exercise?.mediaType,
      finishPreparingPlayback,
      safePauseAudio,
      safePauseVideo,
      safePlayAudio,
      safePlayVideo,
      startPreparingPlayback,
      videoPlayer,
    ],
  )

  const currentTime =
    exercise?.mediaType === 'video' ? videoPlaybackState.currentTime : audioStatus.currentTime
  const duration =
    exercise?.mediaType === 'video' ? videoPlaybackState.duration : audioStatus.duration
  const isPlaying =
    exercise?.mediaType === 'video' ? videoPlaybackState.playing : audioStatus.playing

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        pause()
      }
    })

    return () => {
      subscription.remove()
    }
  }, [pause])

  useEffect(
    () => () => {
      playbackTokenRef.current += 1
      activeRangeRef.current = null
      pendingRangeRef.current = null
      clearRangeStopTimeout()
      setActiveLineId(null)
      preparingPlaybackTokenRef.current = null

      tryPauseNativePlayer(audioPlayerRef.current)
      if (Platform.OS === 'web') {
        const videos = Array.from(
          (videoPlayerRef.current as WebVideoPlayer)._mountedVideos ?? [],
        )
        prepareWebVideosForManualPlayback(videos)
        for (const video of videos) {
          video.pause()
        }
      } else {
        tryPauseNativePlayer(videoPlayerRef.current)
      }
    },
    [clearRangeStopTimeout],
  )

  return {
    currentTime,
    duration,
    activeLineId,
    isPlaying,
    isPreparingPlayback,
    pause,
    playAll,
    playLine,
    seekTo,
    togglePlayAll,
    videoPlayer,
  }
}
