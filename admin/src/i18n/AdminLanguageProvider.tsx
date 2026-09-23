import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UiLocale } from '@duolinting/domain'
import { adminMessages, type AdminMessageKey } from './messages'

const ADMIN_UI_LOCALE_KEY = 'duolinting.admin.ui-locale.v1'
export const DEFAULT_ADMIN_UI_LOCALE: UiLocale = 'en-US'

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

type TemplateMatcher = {
  key: string
  names: string[]
  pattern: RegExp
}

let templateMatchers: TemplateMatcher[] | null = null

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getTemplateMatchers = () => {
  if (templateMatchers) return templateMatchers
  templateMatchers = Object.keys(adminMessages['zh-CN']).flatMap((key) => {
    const names = [...key.matchAll(/\{\{([^{}]+)}}/g)].map((match) => match[1])
    if (names.length === 0) return []
    const parts = key.split(/\{\{[^{}]+}}/g).map(escapeRegExp)
    const pattern = new RegExp(`^${parts.map((part, index) => `${part}${index < names.length ? '(.+?)' : ''}`).join('')}$`)
    return [{ key, names, pattern }]
  })
  return templateMatchers
}

/**
 * Admin notifications are often emitted by nested workflow components through
 * `onNotify`/`onStatusChange`. Those callbacks may already contain dynamic
 * values, so resolve them against the Chinese source templates before falling
 * back to the raw text. Direct `t(key, values)` calls still take the fast path.
 */
export const translateAdminMessage = (
  locale: UiLocale,
  key: string,
  values?: Record<string, string | number>,
) => {
  let resolvedValues = values
  let message = adminMessages[locale][key] ?? adminMessages['en-US'][key]

  if (!message && !values) {
    for (const matcher of getTemplateMatchers()) {
      const match = matcher.pattern.exec(key)
      if (!match) continue
      resolvedValues = Object.fromEntries(matcher.names.map((name, index) => [name, match[index + 1]]))
      message = adminMessages[locale][matcher.key] ?? adminMessages['en-US'][matcher.key]
      break
    }
  }

  message ??= key
  if (resolvedValues) {
    for (const [name, value] of Object.entries(resolvedValues)) {
      message = message.replaceAll(`{{${name}}}`, String(value))
    }
  }
  return message
}

const isUiLocale = (value: string | null): value is UiLocale =>
  value === 'zh-CN' || value === 'en-US' || value === 'th-TH' || value === 'ja-JP' || value === 'fr-FR' || value === 'es-ES'

const getInitialUiLocale = (): UiLocale => {
  const stored = localStorage.getItem(ADMIN_UI_LOCALE_KEY)
  if (isUiLocale(stored)) return stored
  return DEFAULT_ADMIN_UI_LOCALE
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
    t: (key, values) => translateAdminMessage(uiLocale, key, values),
  }), [uiLocale])

  return <AdminLanguageContext.Provider value={value}>{children}</AdminLanguageContext.Provider>
}

export function useAdminLanguage() {
  const value = useContext(AdminLanguageContext)
  if (!value) throw new Error('useAdminLanguage must be used inside AdminLanguageProvider')
  return value
}
