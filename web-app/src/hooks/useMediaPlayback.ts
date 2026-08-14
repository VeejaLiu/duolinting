import { useEffect, useRef, useState, type RefObject } from 'react'

type UseMediaPlaybackOptions = {
  mediaRef: RefObject<HTMLMediaElement | null>
  playbackRate: number
}

export function useMediaPlayback({
  mediaRef,
  playbackRate,
}: UseMediaPlaybackOptions) {
  const mediaElement = mediaRef.current
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const stopPlaybackRef = useRef(false)
  const playbackTokenRef = useRef(0)
  const rangeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const media = mediaRef.current
    if (!media) {
      return
    }

    const syncPlaybackState = () => {
      const playing = !media.paused && !media.ended
      isPlayingRef.current = playing
      setIsPlaying(playing)
      setCurrentTime(Number.isFinite(media.currentTime) ? media.currentTime : 0)
      setDuration(Number.isFinite(media.duration) ? media.duration : 0)
    }

    syncPlaybackState()

    media.addEventListener('play', syncPlaybackState)
    media.addEventListener('pause', syncPlaybackState)
    media.addEventListener('ended', syncPlaybackState)
    media.addEventListener('timeupdate', syncPlaybackState)
    media.addEventListener('loadedmetadata', syncPlaybackState)
    media.addEventListener('durationchange', syncPlaybackState)

    return () => {
      media.removeEventListener('play', syncPlaybackState)
      media.removeEventListener('pause', syncPlaybackState)
      media.removeEventListener('ended', syncPlaybackState)
      media.removeEventListener('timeupdate', syncPlaybackState)
      media.removeEventListener('loadedmetadata', syncPlaybackState)
      media.removeEventListener('durationchange', syncPlaybackState)
    }
  }, [mediaElement, mediaRef, playbackRate])

  useEffect(
    () => () => {
      rangeCleanupRef.current?.()
    },
    [],
  )

  const applyPlaybackRate = () => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = playbackRate
    }
  }

  const seekMediaTo = (media: HTMLMediaElement, targetTime: number) =>
    new Promise<void>((resolve) => {
      const finish = () => {
        globalThis.clearTimeout(timeoutId)
        media.removeEventListener('seeked', finish)
        media.removeEventListener('canplay', finish)
        resolve()
      }

      const timeoutId = globalThis.setTimeout(finish, 800)
      media.addEventListener('seeked', finish, { once: true })
      media.addEventListener('canplay', finish, { once: true })
      media.currentTime = targetTime

      if (!media.seeking && Math.abs(media.currentTime - targetTime) < 0.025) {
        finish()
      }
    })

  const stopPlayback = () => {
    playbackTokenRef.current += 1
    rangeCleanupRef.current?.()
    rangeCleanupRef.current = null
    stopPlaybackRef.current = true
    isPlayingRef.current = false
    if (mediaRef.current) {
      mediaRef.current.pause()
    }
    window.speechSynthesis?.cancel()
    setIsPlaying(false)
  }

  const playMediaRange = (start: number, end?: number) =>
    new Promise<void>(async (resolve) => {
      const media = mediaRef.current
      if (!media) {
        globalThis.setTimeout(resolve, 500)
        return
      }

      const playbackToken = playbackTokenRef.current + 1
      playbackTokenRef.current = playbackToken
      rangeCleanupRef.current?.()
      rangeCleanupRef.current = null

      const safeStart = Math.max(0, start)
      const safeEnd = end === undefined ? undefined : Math.max(safeStart, end)
      media.pause()
      await seekMediaTo(media, safeStart)
      if (playbackTokenRef.current !== playbackToken) {
        resolve()
        return
      }

      let finished = false
      let frameId = 0
      let timeoutId = 0

      const cleanup = () => {
        window.cancelAnimationFrame(frameId)
        window.clearTimeout(timeoutId)
        media.removeEventListener('pause', finish)
        media.removeEventListener('ended', finish)
        media.removeEventListener('error', finish)
      }
      const finish = () => {
        if (finished) {
          return
        }
        finished = true
        playbackTokenRef.current += 1
        cleanup()
        rangeCleanupRef.current = null
        resolve()
      }
      const stopAtEnd = () => {
        if (safeEnd === undefined) {
          return
        }

        if (media.currentTime >= safeEnd) {
          media.pause()
          if (Math.abs(media.currentTime - safeEnd) <= 0.12) {
            media.currentTime = safeEnd
          }
          finish()
          return
        }

        frameId = window.requestAnimationFrame(stopAtEnd)
      }

      rangeCleanupRef.current = cleanup
      media.playbackRate = playbackRate
      media.addEventListener('pause', finish)
      media.addEventListener('ended', finish)
      media.addEventListener('error', finish)

      if (safeEnd !== undefined) {
        // 字幕时间是媒体时间轴上的秒数；真实等待时间要除以播放速度。
        // rAF 负责贴近结束点停止，timeout 是后台标签页或低频回调时的兜底。
        const effectivePlaybackRate =
          Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1
        const remainingMilliseconds = Math.max(
          0,
          Math.round(((safeEnd - safeStart) / effectivePlaybackRate) * 1000),
        )
        timeoutId = window.setTimeout(() => {
          if (media.currentTime < safeEnd) {
            media.currentTime = safeEnd
          }
          media.pause()
          finish()
        }, remainingMilliseconds)
        frameId = window.requestAnimationFrame(stopAtEnd)
      }

      void media.play().catch(finish)
    })

  const playMedia = async (startAt?: number) => {
    const media = mediaRef.current
    if (!media) {
      return false
    }

    if (typeof startAt === 'number') {
      await seekMediaTo(media, startAt)
    } else if (media.ended || (media.duration > 0 && media.currentTime >= media.duration)) {
      await seekMediaTo(media, 0)
    }

    stopPlaybackRef.current = false
    applyPlaybackRate()
    try {
      await media.play()
      return true
    } catch {
      setIsPlaying(false)
      return false
    }
  }

  const pauseMedia = () => {
    mediaRef.current?.pause()
  }

  const toggleMediaPlayback = async (options?: { restartAt?: number }) => {
    const media = mediaRef.current
    if (!media) {
      return
    }

    if (!media.paused && !media.ended) {
      pauseMedia()
      return
    }

    await playMedia(options?.restartAt)
  }

  const seekMedia = (time: number) => {
    const media = mediaRef.current
    if (!media) {
      return
    }

    media.currentTime = Math.max(0, Math.min(time, media.duration || time))
    setCurrentTime(media.currentTime)
  }

  const runPlayback = async (task: () => Promise<void>) => {
    if (isPlayingRef.current) {
      return false
    }

    stopPlaybackRef.current = false
    isPlayingRef.current = true
    window.speechSynthesis?.cancel()
    setIsPlaying(true)
    await task()
    // 只有没有被外部 stopPlayback 打断，才重置播放状态
    // （避免竞态：外部 stopPlayback 后新播放已开始，此处错误地把状态清零）
    if (!stopPlaybackRef.current) {
      isPlayingRef.current = false
      setIsPlaying(false)
    }
    return !stopPlaybackRef.current
  }

  return {
    currentTime,
    duration,
    isPlaying,
    pauseMedia,
    playMediaRange,
    playMedia,
    runPlayback,
    seekMedia,
    stopPlayback,
    toggleMediaPlayback,
  }
}
