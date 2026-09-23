import { useEffect, useRef, type RefObject } from 'react'

type UseMediaPlaybackOptions = {
  mediaRef: RefObject<HTMLMediaElement | null>
  // 当前实际播放的 URL；切换媒体后旧 seek/play 请求必须失效。
  sourceKey: string
}

type PlaybackRange = {
  end?: number
  start: number
}

export type SeekOutcome = 'ready' | 'cancelled' | 'timeout' | 'failed'
export type PlaybackOutcome = 'playing' | Exclude<SeekOutcome, 'ready'>

const SEEK_TIMEOUT_MS = 3000
const SEEK_TOLERANCE_SECONDS = 0.001
const SEEKED_POSITION_TOLERANCE_SECONDS = 0.05

export function useMediaPlayback({ mediaRef, sourceKey }: UseMediaPlaybackOptions) {
  const sourceKeyRef = useRef(sourceKey)
  sourceKeyRef.current = sourceKey
  const requestIdRef = useRef(0)
  const pendingSeekCancelRef = useRef<(() => void) | null>(null)
  const rangeCleanupRef = useRef<(() => void) | null>(null)

  const cancelPending = () => {
    requestIdRef.current += 1
    pendingSeekCancelRef.current?.()
    pendingSeekCancelRef.current = null
    rangeCleanupRef.current?.()
    rangeCleanupRef.current = null
  }

  // 原生控件也能自行拖动进度条。它发出的 seek 应取消旧的逐句试听，
  // 否则旧范围结束点仍可能暂停用户新选中的播放位置。
  useEffect(() => {
    const media = mediaRef.current
    const onSeeking = () => {
      // 正在等待本控制器发起的 seek；结果由 seeked/超时处理。
      if (pendingSeekCancelRef.current) return
      cancelPending()
    }
    media?.addEventListener('seeking', onSeeking)
    return () => {
      media?.removeEventListener('seeking', onSeeking)
      cancelPending()
    }
  }, [mediaRef, sourceKey])

  const beginRequest = (media: HTMLMediaElement) => {
    cancelPending()
    return { id: requestIdRef.current, media, source: sourceKeyRef.current }
  }

  const isCurrent = (request: { id: number; media: HTMLMediaElement; source: string }) =>
    request.id === requestIdRef.current &&
    request.media === mediaRef.current &&
    request.source === sourceKeyRef.current

  const seekMediaTo = (media: HTMLMediaElement, targetTime: number) =>
    new Promise<SeekOutcome>((resolve) => {
      let settled = false
      let timeoutId = 0
      const finish = (outcome: SeekOutcome) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        media.removeEventListener('seeked', onSeeked)
        if (pendingSeekCancelRef.current === cancel) pendingSeekCancelRef.current = null
        resolve(outcome)
      }
      const cancel = () => finish('cancelled')
      const onSeeked = () => {
        if (media.seeking) return
        finish(Math.abs(media.currentTime - targetTime) <= SEEKED_POSITION_TOLERANCE_SECONDS
          ? 'ready'
          : 'failed')
      }

      pendingSeekCancelRef.current = cancel
      media.addEventListener('seeked', onSeeked)
      timeoutId = window.setTimeout(() => finish('timeout'), SEEK_TIMEOUT_MS)
      try {
        media.currentTime = targetTime
        // 目标已在当前位置时浏览器可能不会派发 seeked。
        if (media.readyState >= HTMLMediaElement.HAVE_METADATA &&
          !media.seeking && Math.abs(media.currentTime - targetTime) <= SEEK_TOLERANCE_SECONDS) {
          finish('ready')
        }
      } catch {
        finish('failed')
      }
    })

  const seekMedia = async (seconds: number): Promise<SeekOutcome> => {
    const media = mediaRef.current
    if (!media || !Number.isFinite(seconds)) return 'failed'
    const request = beginRequest(media)
    const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : Infinity
    const result = await seekMediaTo(media, Math.min(Math.max(0, seconds), duration))
    if (isCurrent(request) && result !== 'ready') media.pause()
    return isCurrent(request) ? result : 'cancelled'
  }

  const stopPlayback = () => {
    cancelPending()
    mediaRef.current?.pause()
  }

  const playMedia = async (startAt?: number): Promise<PlaybackOutcome> => {
    const media = mediaRef.current
    if (!media || (startAt !== undefined && !Number.isFinite(startAt))) return 'failed'
    const request = beginRequest(media)
    const start = typeof startAt === 'number'
      ? startAt
      : media.ended || (media.duration > 0 && media.currentTime >= media.duration)
        ? 0
        : undefined

    if (start !== undefined) {
      const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : Infinity
      const result = await seekMediaTo(media, Math.min(Math.max(0, start), duration))
      if (!isCurrent(request)) return 'cancelled'
      if (result !== 'ready') {
        media.pause()
        return result
      }
    }
    if (!isCurrent(request)) return 'cancelled'

    try {
      await media.play()
      return isCurrent(request) ? 'playing' : 'cancelled'
    } catch {
      return isCurrent(request) ? 'failed' : 'cancelled'
    }
  }

  const playMediaRange = async ({ start, end }: PlaybackRange): Promise<PlaybackOutcome> => {
    const media = mediaRef.current
    if (!media || !Number.isFinite(start) || (end !== undefined && !Number.isFinite(end))) return 'failed'
    const request = beginRequest(media)
    const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : Infinity
    const safeStart = Math.min(Math.max(0, start), duration)
    const safeEnd = end === undefined ? undefined : Math.min(Math.max(safeStart, end), duration)

    media.pause()
    const result = await seekMediaTo(media, safeStart)
    if (!isCurrent(request)) return 'cancelled'
    if (result !== 'ready') return result
    if (safeEnd !== undefined && safeEnd <= safeStart) return 'failed'

    let finished = false
    let frameId = 0
    const cleanup = () => {
      window.cancelAnimationFrame(frameId)
      media.removeEventListener('pause', finish)
      media.removeEventListener('ended', finish)
      media.removeEventListener('error', finish)
      media.removeEventListener('timeupdate', checkRangeEnd)
    }
    const finish = () => {
      if (finished) return
      finished = true
      cleanup()
      if (isCurrent(request)) {
        requestIdRef.current += 1
        rangeCleanupRef.current = null
      }
    }
    // 以实际媒体时间停止，不用墙上时间推算播放进度。
    const checkRangeEnd = () => {
      if (safeEnd === undefined || !isCurrent(request)) return false
      if (media.currentTime < safeEnd) return false
      media.pause()
      if (Math.abs(media.currentTime - safeEnd) <= 0.12) media.currentTime = safeEnd
      finish()
      return true
    }
    const tick = () => {
      if (!isCurrent(request) || checkRangeEnd()) return
      frameId = window.requestAnimationFrame(tick)
    }

    rangeCleanupRef.current = cleanup
    media.addEventListener('pause', finish)
    media.addEventListener('ended', finish)
    media.addEventListener('error', finish)
    if (safeEnd !== undefined) {
      media.addEventListener('timeupdate', checkRangeEnd)
      frameId = window.requestAnimationFrame(tick)
    }

    try {
      await media.play()
      return isCurrent(request) ? 'playing' : 'cancelled'
    } catch {
      const current = isCurrent(request)
      finish()
      return current ? 'failed' : 'cancelled'
    }
  }

  return { playMedia, playMediaRange, seekMedia, stopPlayback }
}
