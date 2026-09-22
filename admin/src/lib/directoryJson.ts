import type { CreateCategoryGroupRequest, CreateCategoryRequest } from '@duolinting/shared'

export type DirectoryJsonData = Omit<CreateCategoryGroupRequest, 'id'> & { sourceUrl?: string }
export type DirectoryKind = 'group' | 'category'
const locales = ['en-US', 'th-TH', 'ja-JP'] as const

export function buildDirectoryPrompt(form: CreateCategoryGroupRequest | CreateCategoryRequest, kind: DirectoryKind) {
  // The template deliberately excludes IDs: AI output must never change record identity or its parent.
  const template: DirectoryJsonData = {
    name: form.name, description: form.description, accent: form.accent,
    sortOrder: form.sortOrder, coverImageUrl: form.coverImageUrl ?? '',
    ...(kind === 'category' ? { sourceUrl: (form as CreateCategoryRequest).sourceUrl ?? '' } : {}),
    localizations: Object.fromEntries(locales.map((locale) => [locale, form.localizations?.[locale] ?? { name: '', description: '' }])),
  }
  return `请为英语精听产品的${kind === 'group' ? '内容分类' : '学习系列'}生成完整目录资料。请将完整的有效 JSON 对象放在唯一一个 Markdown 代码块中，代码块语言标记为 json，方便我点击复制。所有字段必须放在同一个代码块里，不要拆分，代码块外不要添加说明。
以以下名称和已有描述为依据，完善简洁准确的简体中文名称与描述，并完整翻译为英语、泰语、日语。不要编造来源、版权或课程数量等事实。若名称为空，请先询问我名称。
严格使用下列 JSON 结构：name、description 是简体中文；localizations 中 en-US、th-TH、ja-JP 均须包含非空 name 和 description。不要添加 id、groupId 或其他字段。
accent 是 #RRGGBB 六位十六进制颜色；sortOrder 是非负整数（越小越靠前）。保留已有颜色和排序。coverImageUrl 是封面地址，${kind === 'category' ? 'sourceUrl 是原始材料的 http(s) 来源链接，' : ''}这些地址原样保留，不要虚构，空值保持空字符串。
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
