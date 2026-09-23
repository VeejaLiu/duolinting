import type { TranscriptLine, ContentLocale } from './domain.js'

/** Immutable published/preview content identity; source coordinates are integer microseconds. */
export type CourseReleaseManifest = {
  courseReleaseId: number
  mediaRevision: string
  timelineId: string
  subtitleRevision: string
  waveformRevision: string | null
  playbackContractVersion: number
  timelineOriginUs: 0
  audioTrackIndex: 0
  durationUs: number | null
  /** Existing courses imported by migration are explicitly not output-verified. */
  verifiedMedia: boolean
  state: 'preview' | 'published'
}
export type CourseWaveform = {
  revision: string
  mediaRevision: string
  timelineId: string
  durationUs: number
  /** Each bucket spans 10 ms of source time. This is a peak summary, not PCM. */
  bucketDurationUs: 10000
  peaks: number[]
}
export const SUPPORTED_PLAYBACK_CONTRACT_VERSION = 1
export const coursePlaybackKey = (course: { id: number; audioUrl: string; release?: CourseReleaseManifest }) =>
  course.release ? `${course.id}:release:${course.release.courseReleaseId}:${course.release.mediaRevision}` : `${course.id}:${course.audioUrl}`
export const supportsCoursePlayback = (course: { release?: CourseReleaseManifest }) =>
  !course.release || course.release.playbackContractVersion <= SUPPORTED_PLAYBACK_CONTRACT_VERSION
/** Shared overlap/translation rules: preserve document order and return every matching line. */
export const activeTranscriptLines = <T extends { start: number; end: number }>(lines: T[], sourceSeconds: number) =>
  lines.filter((line) => sourceSeconds >= line.start && sourceSeconds < line.end)
export const transcriptTranslation = (line: TranscriptLine, locale: ContentLocale) =>
  line.translations?.[locale] ?? (locale === 'zh-CN' ? line.translation : '')
