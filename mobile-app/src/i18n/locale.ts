import type { ContentLocale, UiLocale } from '@duolinting/domain'

export const UI_LOCALES: readonly UiLocale[] = ['en-US', 'zh-CN', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']
export const CONTENT_LOCALES: readonly ContentLocale[] = [
  'en-US',
  'zh-CN',
  'th-TH',
  'ja-JP',
  'fr-FR',
  'es-ES',
]

export type LanguagePreferences = {
  uiLocale: UiLocale
  contentLocale: ContentLocale
}

export type StoredLanguagePreferences = LanguagePreferences & {
  /**
   * 网络不可用时保留最近一次改动。重新取得账号偏好后只重放这些字段，
   * 防止设备上的离线选择被较早的云端记录覆盖。
   */
  pending?: Partial<LanguagePreferences>
}

export const uiLocaleLabels: Record<UiLocale, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
  'fr-FR': 'Français',
  'es-ES': 'Español',
}

/** 认证页与设置页共用的语言识别符，避免仅用文字导致多语言列表扫读困难。 */
export const uiLocaleFlags: Record<UiLocale, string> = {
  'en-US': '🇺🇸',
  'zh-CN': '🇨🇳',
  'th-TH': '🇹🇭',
  'ja-JP': '🇯🇵',
  'fr-FR': '🇫🇷',
  'es-ES': '🇪🇸',
}

export const contentLocaleLabels: Record<ContentLocale, string> = {
  'en-US': 'English',
  'zh-CN': '中文',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
  'fr-FR': 'Français',
  'es-ES': 'Español',
}

export const isUiLocale = (value: unknown): value is UiLocale =>
  typeof value === 'string' && UI_LOCALES.includes(value as UiLocale)

export const isContentLocale = (value: unknown): value is ContentLocale =>
  typeof value === 'string' && CONTENT_LOCALES.includes(value as ContentLocale)

export const defaultLanguagePreferences = (): LanguagePreferences => ({
  uiLocale: 'en-US',
  contentLocale: 'en-US',
})
