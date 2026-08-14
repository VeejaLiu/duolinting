import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ContentLocale, UiLocale } from '@duolinting/domain'
import { messages, type MessageKey } from './messages'

const UI_LOCALE_KEY = 'duolinting.web.ui-locale.v1'
const CONTENT_LOCALE_KEY = 'duolinting.web.content-locale.v1'

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

type LanguageContextValue = {
  uiLocale: UiLocale
  contentLocale: ContentLocale
  setUiLocale: (locale: UiLocale) => void
  setContentLocale: (locale: ContentLocale) => void
  t: (key: MessageKey, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const getInitialUiLocale = (): UiLocale => {
  const stored = localStorage.getItem(UI_LOCALE_KEY)
  if (stored === 'zh-CN' || stored === 'en-US' || stored === 'th-TH' || stored === 'ja-JP') return stored
  const browserLanguage = navigator.languages.find((locale) => {
    const code = locale.toLowerCase()
    return code.startsWith('en') || code.startsWith('th') || code.startsWith('ja')
  })
  if (browserLanguage?.toLowerCase().startsWith('en')) return 'en-US'
  if (browserLanguage?.toLowerCase().startsWith('th')) return 'th-TH'
  if (browserLanguage?.toLowerCase().startsWith('ja')) return 'ja-JP'
  return 'zh-CN'
}

const getInitialContentLocale = (): ContentLocale => {
  const stored = localStorage.getItem(CONTENT_LOCALE_KEY)
  return stored === 'zh-CN' || stored === 'en-US' || stored === 'th-TH' || stored === 'ja-JP'
    ? stored
    : 'zh-CN'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [uiLocale, setUiLocaleState] = useState<UiLocale>(getInitialUiLocale)
  const [contentLocale, setContentLocaleState] = useState<ContentLocale>(getInitialContentLocale)

  useEffect(() => {
    localStorage.setItem(UI_LOCALE_KEY, uiLocale)
    document.documentElement.lang = uiLocale
  }, [uiLocale])

  useEffect(() => {
    localStorage.setItem(CONTENT_LOCALE_KEY, contentLocale)
  }, [contentLocale])

  const value = useMemo<LanguageContextValue>(() => ({
    uiLocale,
    contentLocale,
    setUiLocale: setUiLocaleState,
    setContentLocale: setContentLocaleState,
    t: (key, values) => {
      // 语义 key 查消息表；查不到说明有组件漏配 key，原样返回 key 便于排查。
      let message = messages[uiLocale][key] ?? messages['zh-CN'][key] ?? key
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          message = message.replaceAll(`{{${name}}}`, String(value))
        }
      }
      return message
    },
  }), [contentLocale, uiLocale])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider')
  return value
}
