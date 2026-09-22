import type { CreateCategoryGroupRequest, CreateCategoryRequest } from '@duolinting/shared'

export type DirectoryJsonData = Omit<CreateCategoryGroupRequest, 'id'> & { sourceUrl?: string }
export type DirectoryKind = 'group' | 'category'
const locales = ['zh-CN', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES'] as const

export function buildDirectoryPrompt(form: CreateCategoryGroupRequest | CreateCategoryRequest, kind: DirectoryKind) {
  // The template deliberately excludes IDs: AI output must never change record identity or its parent.
  const template: DirectoryJsonData = {
    name: form.name, description: form.description, accent: form.accent,
    sortOrder: form.sortOrder, coverImageUrl: form.coverImageUrl ?? '',
    ...(kind === 'category' ? { sourceUrl: (form as CreateCategoryRequest).sourceUrl ?? '' } : {}),
    localizations: Object.fromEntries(locales.map((locale) => [locale, form.localizations?.[locale] ?? { name: '', description: '' }])),
  }
  return `Create complete directory content for an English listening app's ${kind === 'group' ? 'content category' : 'learning series'}.
Return the entire valid JSON object in exactly one Markdown code block marked json, so it can be copied in one click. Do not split the output or add text outside the code block.
Use the supplied name and description to produce a concise, accurate English name and description. Translate both into Simplified Chinese, Thai, Japanese, French, and Spanish. Do not invent facts about sources, copyright, or course counts. If the name is empty, ask me for it first.
Follow this JSON structure exactly. The top-level name and description must be English. Each localizations entry (zh-CN, th-TH, ja-JP, fr-FR, es-ES) must contain a nonempty name and description. Do not add id, groupId, or other fields.
accent is a six-digit #RRGGBB color. sortOrder is a nonnegative integer (smaller numbers appear first). Preserve the existing color and order. coverImageUrl is the cover image URL; ${kind === 'category' ? 'sourceUrl is the original material’s http(s) URL; ' : ''}preserve URLs exactly, never invent them, and keep empty strings empty.
\n${JSON.stringify(template, null, 2)}`
}

export function parseDirectoryJson(input: string, kind: DirectoryKind): DirectoryJsonData {
  // Accept a single Markdown JSON fence because chat tools frequently wrap otherwise valid JSON.
  const raw = input.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('JSON') }
  const object = (value: unknown, path: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(path)
    return value as Record<string, unknown>
  }
  const data = object(parsed, 'JSON')
  const allowed = ['name', 'description', 'accent', 'sortOrder', 'coverImageUrl', 'localizations', ...(kind === 'category' ? ['sourceUrl'] : [])]
  const extra = Object.keys(data).find((key) => !allowed.includes(key))
  if (extra) throw new Error(extra)
  const string = (value: unknown, path: string, required = true) => {
    if (typeof value !== 'string' || (required && !value.trim())) throw new Error(path)
    return value.trim()
  }
  const name = string(data.name, 'name')
  const description = string(data.description, 'description')
  const accent = string(data.accent, 'accent')
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('accent')
  if (typeof data.sortOrder !== 'number' || !Number.isSafeInteger(data.sortOrder) || data.sortOrder < 0) throw new Error('sortOrder')
  const translations = object(data.localizations, 'localizations')
  const extraLocale = Object.keys(translations).find((locale) => !locales.some((supported) => supported === locale))
  if (extraLocale) throw new Error(`localizations.${extraLocale}`)
  const localizations: DirectoryJsonData['localizations'] = {}
  for (const locale of locales) {
    const entry = object(translations[locale], `localizations.${locale}`)
    if (Object.keys(entry).some((key) => key !== 'name' && key !== 'description')) throw new Error(`localizations.${locale}`)
    localizations[locale] = {
      name: string(entry.name, `localizations.${locale}.name`),
      description: string(entry.description, `localizations.${locale}.description`),
    }
  }
  const result: DirectoryJsonData = { name, description, accent, sortOrder: data.sortOrder, localizations }
  // Omitted optional URLs preserve the current form value; an explicit empty string clears it.
  for (const key of ['coverImageUrl', 'sourceUrl'] as const) {
    if (!(key in data)) continue
    const value = string(data[key], key, false)
    if (value && !(key === 'coverImageUrl' && value.startsWith('/api/v1/media/objects'))) {
      try {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol) || (key === 'sourceUrl' && value.length > 2048)) throw new Error(key)
      } catch { throw new Error(key) }
    }
    result[key] = value
  }
  return result
}
