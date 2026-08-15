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

/** 认证页与设置页共用的语言识别符，避免仅用文字导致多语言列表扫读困难。 */
export const uiLocaleFlags: Record<UiLocale, string> = {
  'zh-CN': '🇨🇳',
  'en-US': '🇺🇸',
  'th-TH': '🇹🇭',
  'ja-JP': '🇯🇵',
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
  // 设备未提供语言、或语言尚不在应用支持范围内时，以英语作为通用兜底。
  // 这里不能猜测为中文，否则非中文设备会在首次打开认证页时看到陌生文案。
  if (preferredLocale === 'zh') return 'zh-CN'
  return 'en-US'
}

export const defaultLanguagePreferences = (): LanguagePreferences => ({
  uiLocale: getDeviceUiLocale(),
  contentLocale: 'zh-CN',
})
