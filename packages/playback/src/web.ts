import { SEEK_TOLERANCE_US, secondsToUs, usToSeconds, type PlaybackAdapter, type PlaybackEvent } from './index.js'

export function createWebPlaybackAdapter(getMedia: () => HTMLMediaElement | null, getSource: () => string): PlaybackAdapter {
  const requireMedia = () => {
    const media = getMedia()
    if (!media) throw new Error('Media unavailable')
    return media
  }
  return {
    snapshot() {
      const media = requireMedia()
      return { sourceKey: getSource(), positionUs: secondsToUs(media.currentTime),
        durationUs: Number.isFinite(media.duration) ? secondsToUs(media.duration) : 0,
        playing: !media.paused && !media.ended, buffering: media.readyState < 3, ended: media.ended }
    },
    seek(positionUs, signal) {
      const media = requireMedia()
      return new Promise<void>((resolve, reject) => {
        const target = usToSeconds(positionUs)
        const finish = (error?: Error) => {
          media.removeEventListener('seeked', complete)
          signal.removeEventListener('abort', abort)
          if (error) reject(error); else resolve()
        }
        const abort = () => finish(new Error('cancelled'))
        const complete = () => {
          if (media.seeking) return
          finish(Math.abs(secondsToUs(media.currentTime) - positionUs) <= SEEK_TOLERANCE_US
            ? undefined : new Error('Seek position mismatch'))
        }
        if (signal.aborted) return abort()
        // Skip a same-position assignment: its queued seeking event could cancel a new session.
        if (media.readyState >= 1 && !media.seeking && Math.abs(media.currentTime - target) <= 0.001) return resolve()
        media.addEventListener('seeked', complete)
        signal.addEventListener('abort', abort, { once: true })
        try { media.currentTime = target } catch (error) { finish(error instanceof Error ? error : new Error('Seek failed')) }
      })
    },
    async play(signal) {
      if (signal.aborted) throw new Error('cancelled')
      await requireMedia().play()
    },
    pause() { getMedia()?.pause() },
    subscribe(listener) {
      const media = requireMedia()
      let frame = 0
      let disposed = false
      const emit = (event: PlaybackEvent) => { if (!disposed) listener(event) }
      const tick = () => {
        frame = 0
        if (disposed || media.paused || media.ended) return
        emit('time')
        if (!disposed) frame = requestAnimationFrame(tick)
      }
      const onPlaying = () => { emit('playing'); if (!disposed && !frame) frame = requestAnimationFrame(tick) }
      const onPause = () => {
        cancelAnimationFrame(frame); frame = 0
        if (media.paused && !media.ended) emit('pause')
      }
      const onTime = () => emit('time')
      const onEnded = () => emit('ended')
      const onError = () => emit('error')
      const onSeeking = () => emit('seeking')
      const onVisibility = () => { if (document.visibilityState !== 'visible') emit('interrupted') }
      media.addEventListener('playing', onPlaying)
      media.addEventListener('pause', onPause)
      media.addEventListener('timeupdate', onTime)
      media.addEventListener('ended', onEnded)
      media.addEventListener('error', onError)
      media.addEventListener('seeking', onSeeking)
      document.addEventListener('visibilitychange', onVisibility)
      if (!media.paused && !media.ended) frame = requestAnimationFrame(tick)
      return () => {
        disposed = true
        cancelAnimationFrame(frame)
        media.removeEventListener('playing', onPlaying)
        media.removeEventListener('pause', onPause)
        media.removeEventListener('timeupdate', onTime)
        media.removeEventListener('ended', onEnded)
        media.removeEventListener('error', onError)
        media.removeEventListener('seeking', onSeeking)
        document.removeEventListener('visibilitychange', onVisibility)
      }
    },
  }
}
