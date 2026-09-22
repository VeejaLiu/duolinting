import type { CreateExerciseRequest } from '@duolinting/shared'
import { TRANSLATION_TARGET_LOCALES } from './mediaDraftTools'

export type CourseMetadataJson = Pick<CreateExerciseRequest, 'title' | 'summary' | 'localizations'>

export function buildCourseMetadataPrompt(form: CourseMetadataJson): string {
  // Only text metadata crosses the AI handoff; IDs, media, subtitles and publication settings stay local.
  const template: CourseMetadataJson = {
    title: form.title,
    summary: form.summary,
    localizations: Object.fromEntries(TRANSLATION_TARGET_LOCALES.map((locale) => [
      locale, form.localizations?.[locale] ?? { title: '', summary: '' },
    ])),
  }
  return `Translate the title and summary of this English listening course.
Use the supplied title and summary as your source. The top-level title and summary must be English. If the source is in another language, translate it accurately into English. Preserve proper names and meaning. Do not invent course content or facts. If the summary is empty, keep every summary empty rather than inventing one.
Provide complete translations into Simplified Chinese (zh-CN), Thai (th-TH), Japanese (ja-JP), French (fr-FR), and Spanish (es-ES). Each localizations entry must contain title and summary. Use exactly the fields in the template; do not add IDs, settings, subtitles, or an en-US entry (English uses the top-level fields).
Return the entire valid JSON in exactly one Markdown code block marked json, ready to copy and paste. Do not generate a file, split the response, omit fields, or add text outside the code block.

${JSON.stringify(template, null, 2)}`
}

export function parseCourseMetadataJson(input: string): CourseMetadataJson {
  // Validate the whole payload before updating the form: malformed output must never partially overwrite edits.
  const raw = input.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('JSON') }
  const object = (value: unknown, path: string, keys: readonly string[]): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(path)
    const extra = Object.keys(value).find((key) => !keys.includes(key))
    if (extra) throw new Error(`${path}.${extra}`)
    return value as Record<string, unknown>
  }
  const text = (value: unknown, path: string, required: boolean) => {
    if (typeof value !== 'string' || (required && !value.trim())) throw new Error(path)
    return value.trim()
  }
  const data = object(parsed, 'JSON', ['title', 'summary', 'localizations'])
  const title = text(data.title, 'title', true)
  const summary = text(data.summary, 'summary', false)
  const translations = object(data.localizations, 'localizations', TRANSLATION_TARGET_LOCALES)
  const localizations: NonNullable<CourseMetadataJson['localizations']> = {}
  for (const locale of TRANSLATION_TARGET_LOCALES) {
    const path = `localizations.${locale}`
    const entry = object(translations[locale], path, ['title', 'summary'])
    localizations[locale] = {
      title: text(entry.title, `${path}.title`, true),
      summary: text(entry.summary, `${path}.summary`, Boolean(summary)),
    }
  }
  return { title, summary, localizations }
}
