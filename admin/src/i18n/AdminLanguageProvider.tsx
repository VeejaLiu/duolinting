import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UiLocale } from '@duolinting/domain'
import { adminMessages, type AdminMessageKey } from './messages'

const ADMIN_UI_LOCALE_KEY = 'duolinting.admin.ui-locale.v1'

export const adminUiLocaleLabels: Record<UiLocale, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
  'fr-FR': 'Français',
  'es-ES': 'Español',
}

type AdminLanguageContextValue = {
  uiLocale: UiLocale
  setUiLocale: (locale: UiLocale) => void
  t: (key: AdminMessageKey, values?: Record<string, string | number>) => string
}

const AdminLanguageContext = createContext<AdminLanguageContextValue | null>(null)

const isUiLocale = (value: string | null): value is UiLocale =>
  value === 'zh-CN' || value === 'en-US' || value === 'th-TH' || value === 'ja-JP' || value === 'fr-FR' || value === 'es-ES'

const getInitialUiLocale = (): UiLocale => {
  const stored = localStorage.getItem(ADMIN_UI_LOCALE_KEY)
  if (isUiLocale(stored)) return stored
  return 'en-US'
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
      let message = adminMessages[uiLocale][key] ?? adminMessages['en-US'][key] ?? key
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
