import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UiLocale } from '@duolinting/domain'
import { adminMessages, type AdminMessageKey } from './messages'

const ADMIN_UI_LOCALE_KEY = 'duolinting.admin.ui-locale.v1'

export const adminUiLocaleLabels: Record<UiLocale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
}

type AdminLanguageContextValue = {
  uiLocale: UiLocale
  setUiLocale: (locale: UiLocale) => void
  t: (key: AdminMessageKey, values?: Record<string, string | number>) => string
}

const AdminLanguageContext = createContext<AdminLanguageContextValue | null>(null)

const isUiLocale = (value: string | null): value is UiLocale =>
  value === 'zh-CN' || value === 'en-US' || value === 'th-TH' || value === 'ja-JP'

const getInitialUiLocale = (): UiLocale => {
  const stored = localStorage.getItem(ADMIN_UI_LOCALE_KEY)
  if (isUiLocale(stored)) return stored
  const browserLocale = navigator.languages.find((locale) => {
    const code = locale.toLowerCase()
    return code.startsWith('en') || code.startsWith('th') || code.startsWith('ja')
  })
  if (browserLocale?.toLowerCase().startsWith('en')) return 'en-US'
  if (browserLocale?.toLowerCase().startsWith('th')) return 'th-TH'
  if (browserLocale?.toLowerCase().startsWith('ja')) return 'ja-JP'
  return 'zh-CN'
}

export function AdminLanguageProvider({ children }: { children: ReactNode }) {
  const [uiLocale, setUiLocale] = useState<UiLocale>(getInitialUiLocale)

  useEffect(() => {
    localStorage.setItem(ADMIN_UI_LOCALE_KEY, uiLocale)
    document.documentElement.lang = uiLocale
  }, [uiLocale])

  const value = useMemo<AdminLanguageContextValue>(() => ({
    uiLocale,
    setUiLocale,
    t: (key, values) => {
      let message = adminMessages[uiLocale][key] ?? adminMessages['zh-CN'][key] ?? key
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          message = message.replaceAll(`{{${name}}}`, String(value))
        }
      }
      return message
    },
  }), [uiLocale])

  return <AdminLanguageContext.Provider value={value}>{children}</AdminLanguageContext.Provider>
}

export function useAdminLanguage() {
  const value = useContext(AdminLanguageContext)
  if (!value) throw new Error('useAdminLanguage must be used inside AdminLanguageProvider')
  return value
}
