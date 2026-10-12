import type { CourseWaveform } from '@duolinting/shared'
import { getCachedWaveform, validWaveform, type CachedWaveform } from './waveformCache'

/** Peaks and duration are sufficient for rendering; no player readiness is needed. */
export async function resolveWaveformSource(
  url: string,
  file?: Blob,
  supplied?: CourseWaveform,
): Promise<{ waveform?: CachedWaveform; mediaUrl: string; serverHit: boolean }> {
  // A newly selected file replaces the old course media, even before upload finishes.
  const cached = !file && supplied
    ? { duration: supplied.durationUs / 1_000_000, peaks: supplied.peaks }
    : undefined
  if (validWaveform(cached)) return { waveform: cached, mediaUrl: '', serverHit: true }
  try {
    const waveform = await getCachedWaveform(url, file)
    return { waveform, mediaUrl: '', serverHit: false }
  } catch {
    // Only the original-loader fallback gets a URL. Supplying one with cached
    // peaks would cause the hidden HTML media element to download unnecessarily.
    return { mediaUrl: url, serverHit: false }
  }
}
