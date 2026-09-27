import type { ContentLocale, UiLocale } from '@duolinting/domain'
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useAccountPreferencesStore } from '@/stores/accountPreferencesStore'
import { languageStorage } from './languageStorage'
import { defaultLanguagePreferences, isContentLocale, isUiLocale, type LanguagePreferences } from './locale'
import { messages, type MessageKey } from './messages'

type LanguageContextValue = LanguagePreferences & {
  languageReady: boolean
  setUiLocale: (locale: UiLocale) => Promise<void>
  setContentLocale: (locale: ContentLocale) => Promise<void>
  t: (key: MessageKey, values?: Record<string, string | number>) => string
}
const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: PropsWithChildren) {
  const userId = useAuthStore((state) => state.authUser?.id)
  const account = useAccountPreferencesStore()
  const [deviceLanguage, setDeviceLanguage] = useState(defaultLanguagePreferences)
  const [languageReady, setLanguageReady] = useState(false)

  useEffect(() => {
    let active = true
    void languageStorage.load().then((saved) => {
      if (!active) return
      setDeviceLanguage({
        uiLocale: isUiLocale(saved?.uiLocale) ? saved.uiLocale : 'en-US',
        contentLocale: isContentLocale(saved?.contentLocale) ? saved.contentLocale : 'en-US',
      })
      setLanguageReady(true)
    })
    return () => { active = false }
  }, [])

  const useAccount = Boolean(userId && account.ready && account.userId === String(userId))
  const uiLocale = useAccount ? account.uiLocale : deviceLanguage.uiLocale
  const contentLocale = useAccount ? account.contentLocale : deviceLanguage.contentLocale
  const setLocale = async (patch: Partial<LanguagePreferences>) => {
    if (useAccount) {
      await account.update(patch)
      return
    }
    const next = { ...deviceLanguage, ...patch }
    await languageStorage.save(next)
    setDeviceLanguage(next)
  }
  const value = useMemo<LanguageContextValue>(() => ({
    uiLocale, contentLocale, languageReady,
    setUiLocale: (locale) => setLocale({ uiLocale: locale }),
    setContentLocale: (locale) => setLocale({ contentLocale: locale }),
    t: (key, values) => {
      let message: string = messages[uiLocale][key] ?? messages['en-US'][key] ?? key
      if (values) for (const [name, replacement] of Object.entries(values)) {
        message = message.replaceAll(`{{${name}}}`, String(replacement))
      }
      return message
    },
  }), [uiLocale, contentLocale, languageReady, account.update, deviceLanguage, useAccount])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider')
  return value
}
