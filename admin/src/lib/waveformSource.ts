import type { CourseWaveform } from '@duolinting/shared'
import { getCachedWaveform, validWaveform, type CachedWaveform } from './waveformCache'

/** Compare the object locator, retaining query fields that can select different bytes. */
export function waveformMediaLocator(url: string) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  const address = new URL(url, typeof location === 'undefined' ? 'http://localhost' : location.href)
  // Our CDN Type A "sign" and backend-token fields grant temporary access;
  // they are not content versions. Keep "key" and every other query field.
  const sign = address.searchParams.get('sign')
  if (sign && /^\d+-[a-f0-9]{16}-\d+-[a-f0-9]{32}$/i.test(sign)) address.searchParams.delete('sign')
  if (/\/api\/v1\/media\/objects(?:\/|$)/.test(address.pathname)) {
    address.searchParams.delete('expires')
    address.searchParams.delete('mediaToken')
  }
  address.searchParams.sort()
  return address.href
}

/** Rendering identity describes media bytes, not a fresh cache object or signed URL. */
export function waveformMediaIdentity(url: string, revision?: string, supplied?: CourseWaveform) {
  if (!url) return ''
  const mediaRevision = revision || supplied?.mediaRevision
  return mediaRevision ? `revision:${mediaRevision}` : `url:${url}`
}

/** A refreshed detail may renew its signature while the editor keeps the original player URL. */
export function waveformForEditor(
  exercise: { id: number; audioUrl: string; waveform?: CourseWaveform; waveformSourceRevision?: string } | null,
  course: { id?: number; audioUrl: string },
  file?: Blob | null,
) {
  return !file && exercise && exercise.id === course.id && course.audioUrl &&
    waveformMediaLocator(exercise.audioUrl) === waveformMediaLocator(course.audioUrl)
    ? { waveform: exercise.waveform, revision: exercise.waveformSourceRevision }
    : { waveform: undefined, revision: undefined }
}

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
