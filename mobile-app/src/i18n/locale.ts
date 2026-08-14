import { getLocales } from 'expo-localization'
import type { ContentLocale, UiLocale } from '@duolinting/domain'

export const UI_LOCALES: readonly UiLocale[] = ['zh-CN', 'en-US', 'th-TH', 'ja-JP']
export const CONTENT_LOCALES: readonly ContentLocale[] = [
  'zh-CN',
  'en-US',
  'th-TH',
  'ja-JP',
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
  'zh-CN': '简体中文',
  'en-US': 'English',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
}

export const contentLocaleLabels: Record<ContentLocale, string> = {
  'zh-CN': '中文',
  'en-US': 'English',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
}

export const isUiLocale = (value: unknown): value is UiLocale =>
  typeof value === 'string' && UI_LOCALES.includes(value as UiLocale)

export const isContentLocale = (value: unknown): value is ContentLocale =>
  typeof value === 'string' && CONTENT_LOCALES.includes(value as ContentLocale)

/** SDK 54 的 expo-localization 在原生与 Web 都提供 getLocales()。 */
export function getDeviceUiLocale(): UiLocale {
  const preferredLocale = getLocales()[0]?.languageCode?.toLowerCase()
  if (preferredLocale === 'en') return 'en-US'
  if (preferredLocale === 'th') return 'th-TH'
  if (preferredLocale === 'ja') return 'ja-JP'
  return 'zh-CN'
}

export const defaultLanguagePreferences = (): LanguagePreferences => ({
  uiLocale: getDeviceUiLocale(),
  contentLocale: 'zh-CN',
})
