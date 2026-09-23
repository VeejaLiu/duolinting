import type { TranscriptLine, ContentLocale } from './domain.js'

export type CourseWaveform = {
  revision: string
  mediaRevision: string
  timelineId: string
  durationUs: number
  /** Each bucket spans 10 ms of source time. This is a peak summary, not PCM. */
  bucketDurationUs: 10000
  peaks: number[]
}
/** A media change cancels an in-flight playback session, without creating a course version. */
export const coursePlaybackKey = (course: { id: number; audioUrl: string }) => `${course.id}:${course.audioUrl}`
/** Shared overlap/translation rules: preserve document order and return every matching line. */
export const activeTranscriptLines = <T extends { start: number; end: number }>(lines: T[], sourceSeconds: number) =>
  lines.filter((line) => sourceSeconds >= line.start && sourceSeconds < line.end)
export const transcriptTranslation = (line: TranscriptLine, locale: ContentLocale) =>
  line.translations?.[locale] ?? (locale === 'zh-CN' ? line.translation : '')
