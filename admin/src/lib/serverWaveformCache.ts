import { syncWaveformCache } from './apiClient'
import { getCachedWaveform, validWaveform, type CachedWaveform } from './waveformCache'

/** Rendering never awaits this maintenance job. It returns false quietly on failure. */
export async function persistServerWaveform(options: {
  exerciseId: number; adminToken: string; mediaUrl: string; sourceUrl: string
  file?: Blob; sourceRevision?: string; wave: CachedWaveform; stopped: () => boolean
}): Promise<boolean> {
  for (let attempt = 0; attempt < 3 && !options.stopped(); attempt++) {
    try {
      let revision = options.sourceRevision
      let summary = options.wave
      if (!revision) {
        const state = await syncWaveformCache(options.exerciseId, options.adminToken, options.mediaUrl)
        if (options.stopped() || !state.waveformSourceRevision) return false
        if (state.waveform && validWaveform({ duration: state.waveform.durationUs / 1_000_000, peaks: state.waveform.peaks })) return true
        revision = state.waveformSourceRevision
        // A local file is the exact uploaded source. For a remote fallback load,
        // verify current bytes after capturing the server revision before filling it.
        if (!options.file) summary = await getCachedWaveform(options.sourceUrl)
      }
      if (options.stopped()) return false
      await syncWaveformCache(options.exerciseId, options.adminToken, options.mediaUrl, {
        sourceRevision: revision,
        // Four decimals suffice for display and keep two million buckets below 20 MiB.
        waveform: { duration: summary.duration, peaks: summary.peaks.map((peak) => Math.round(peak * 10000) / 10000) },
      })
      return true
    } catch (error) {
      // Stale sources/auth/validation failures cannot be repaired by retrying old peaks.
      if (error && typeof error === 'object' && 'status' in error &&
        typeof error.status === 'number' && error.status >= 400 && error.status < 500) return false
      if (attempt < 2 && !options.stopped()) await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000))
    }
  }
  return false
}
