import { useEffect, useRef, useState, type RefObject } from 'react'

type UseMediaPlaybackOptions = {
  mediaRef: RefObject<HTMLMediaElement | null>
}

type PlaybackRange = {
  end?: number
  start: number
}

const SEEK_TOLERANCE_SECONDS = 0.001

export function useMediaPlayback({
  mediaRef,
}: UseMediaPlaybackOptions) {
  const mediaElement = mediaRef.current
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const isPlayingRef = useRef(false)
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
    media.addEventListener('seeking', syncPlaybackState)
    media.addEventListener('loadedmetadata', syncPlaybackState)
    media.addEventListener('durationchange', syncPlaybackState)

    return () => {
      media.removeEventListener('play', syncPlaybackState)
      media.removeEventListener('pause', syncPlaybackState)
      media.removeEventListener('ended', syncPlaybackState)
      media.removeEventListener('timeupdate', syncPlaybackState)
      media.removeEventListener('seeking', syncPlaybackState)
      media.removeEventListener('loadedmetadata', syncPlaybackState)
      media.removeEventListener('durationchange', syncPlaybackState)
    }
  }, [mediaElement, mediaRef])

  useEffect(
    () => () => {
      rangeCleanupRef.current?.()
    },
    [],
  )

  const seekMediaTo = (media: HTMLMediaElement, targetTime: number) =>
    new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(finish, 800)

      function finish() {
        window.clearTimeout(timeoutId)
        media.removeEventListener('seeked', finish)
        resolve()
      }

      media.addEventListener('seeked', finish, { once: true })
      media.currentTime = targetTime

      if (
        !media.seeking &&
        Math.abs(media.currentTime - targetTime) < SEEK_TOLERANCE_SECONDS
      ) {
        finish()
      }
    })

  const stopPlayback = () => {
    playbackTokenRef.current += 1
    rangeCleanupRef.current?.()
    rangeCleanupRef.current = null
    isPlayingRef.current = false
    mediaRef.current?.pause()
    setIsPlaying(false)
  }

  const playMedia = async (startAt?: number) => {
    const media = mediaRef.current
    if (!media) {
      return false
    }

    if (typeof startAt === 'number') {
      // 精确跳转会取代正在进行的逐句试听，先撤销旧的结束点监听，
      // 避免新播放仍被上一句的范围计时器暂停。
      playbackTokenRef.current += 1
      rangeCleanupRef.current?.()
      rangeCleanupRef.current = null
      await seekMediaTo(media, startAt)
    } else if (
      media.ended ||
      (media.duration > 0 && media.currentTime >= media.duration)
    ) {
      await seekMediaTo(media, 0)
    }

    try {
      await media.play()
      return true
    } catch {
      setIsPlaying(false)
      return false
    }
  }

  const pauseMedia = () => {
    stopPlayback()
  }

  const playMediaRange = async ({ start, end }: PlaybackRange) => {
    const media = mediaRef.current
    if (!media) {
      return false
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
      return false
    }

    let finished = false
    let frameId = 0

    const finish = () => {
      if (finished) {
        return
      }
      finished = true
      playbackTokenRef.current += 1
      window.cancelAnimationFrame(frameId)
      media.removeEventListener('pause', finish)
      media.removeEventListener('ended', finish)
      media.removeEventListener('error', finish)
      media.removeEventListener('timeupdate', checkRangeEnd)
      rangeCleanupRef.current = null
      isPlayingRef.current = false
      setIsPlaying(false)
    }

    // 只按实际媒体时间判断终点。墙上时间会在缓冲、后台暂停或倍速播放时
    // 与音轨位置脱节，提前把播放器跳到字幕结束点。
    const checkRangeEnd = () => {
      if (safeEnd === undefined) {
        return false
      }

      if (media.currentTime >= safeEnd) {
        media.pause()
        if (Math.abs(media.currentTime - safeEnd) <= 0.12) {
          media.currentTime = safeEnd
        }
        finish()
        return true
      }

      return false
    }

    const stopAtEnd = () => {
      if (!checkRangeEnd()) {
        frameId = window.requestAnimationFrame(stopAtEnd)
      }
    }

    rangeCleanupRef.current = () => {
      window.cancelAnimationFrame(frameId)
      media.removeEventListener('pause', finish)
      media.removeEventListener('ended', finish)
      media.removeEventListener('error', finish)
      media.removeEventListener('timeupdate', checkRangeEnd)
    }

    media.addEventListener('pause', finish)
    media.addEventListener('ended', finish)
    media.addEventListener('error', finish)

    if (safeEnd !== undefined) {
      media.addEventListener('timeupdate', checkRangeEnd)
      frameId = window.requestAnimationFrame(stopAtEnd)
    }

    try {
      await media.play()
      isPlayingRef.current = true
      setIsPlaying(true)
      return true
    } catch {
      finish()
      return false
    }
  }

  return {
    currentTime,
    duration,
    isPlaying,
    pauseMedia,
    playMedia,
    playMediaRange,
    stopPlayback,
  }
}
