import { createWebPlaybackAdapter } from '@duolinting/playback/web'
import type { PlaybackAdapter } from '@duolinting/playback'

/** Upgrade buffering only for an explicit seek/play, never for displaying a waveform. */
export function createAdminPlaybackAdapter(
  getMedia: () => HTMLMediaElement | null,
  getSource: () => string,
): PlaybackAdapter {
  const base = createWebPlaybackAdapter(getMedia, getSource)
  let activeSignal: AbortSignal | undefined
  return {
    ...base,
    async prepare(startUs, _endUs, signal) {
      const media = getMedia()
      if (!media) throw new Error('Media unavailable')
      if (signal.aborted) throw new Error('cancelled')
      activeSignal = signal
      // A paused metadata-only video can remain seeking near its buffered edge.
      // Allow its target frame to buffer; restore metadata-only policy when the
      // session finishes/cancels (including seek-only sessions).
      const restore = () => {
        signal.removeEventListener('abort', restore)
        if (activeSignal === signal) {
          activeSignal = undefined
          media.preload = 'metadata'
        }
      }
      signal.addEventListener('abort', restore, { once: true })
      media.preload = 'auto'
      if (media.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            media.removeEventListener('loadedmetadata', ready)
            media.removeEventListener('error', failed)
            signal.removeEventListener('abort', cancelled)
          }
          const ready = () => { cleanup(); resolve() }
          const failed = () => { cleanup(); reject(new Error('Media load failed')) }
          const cancelled = () => { cleanup(); reject(new Error('cancelled')) }
          media.addEventListener('loadedmetadata', ready, { once: true })
          media.addEventListener('error', failed, { once: true })
          signal.addEventListener('abort', cancelled, { once: true })
          if (media.readyState >= 1) ready()
        })
      }
      if (signal.aborted) throw new Error('cancelled')
      if (startUs !== undefined || media.seeking) {
        await base.seek(startUs ?? Math.round(media.currentTime * 1_000_000), signal)
      }
    },
  }
}
