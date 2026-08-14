import type { ContentLocale, UiLocale } from '@duolinting/domain'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { apiClient } from '@/lib/apiClient'
import { useAuthStore } from '@/stores/authStore'
import { languageStorage } from './languageStorage'
import {
  defaultLanguagePreferences,
  isContentLocale,
  isUiLocale,
  type LanguagePreferences,
  type StoredLanguagePreferences,
} from './locale'
import { messages, type MessageKey } from './messages'

type LanguageContextValue = LanguagePreferences & {
  languageReady: boolean
  setUiLocale: (locale: UiLocale) => void
  setContentLocale: (locale: ContentLocale) => void
  t: (key: MessageKey, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const normalizeStoredPreferences = (value: StoredLanguagePreferences | null): StoredLanguagePreferences => {
  const defaults = defaultLanguagePreferences()
  return {
    uiLocale: isUiLocale(value?.uiLocale) ? value.uiLocale : defaults.uiLocale,
    contentLocale: isContentLocale(value?.contentLocale) ? value.contentLocale : defaults.contentLocale,
    pending: value?.pending,
  }
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const authReady = useAuthStore((state) => state.authReady)
  const authToken = useAuthStore((state) => state.authToken)
  const [storedPreferences, setStoredPreferences] = useState<StoredLanguagePreferences>(
    defaultLanguagePreferences,
  )
  const [languageReady, setLanguageReady] = useState(false)
  const preferencesRef = useRef(storedPreferences)

  const persist = useCallback((next: StoredLanguagePreferences) => {
    preferencesRef.current = next
    setStoredPreferences(next)
    void languageStorage.save(next)
  }, [])

  useEffect(() => {
    let mounted = true
    void languageStorage.load().then((saved) => {
      if (!mounted) return
      persist(normalizeStoredPreferences(saved))
      setLanguageReady(true)
    })
    return () => {
      mounted = false
    }
  }, [persist])

  const syncPendingPreferences = useCallback((token: string, pending: Partial<LanguagePreferences>) => {
    if (!pending.uiLocale && !pending.contentLocale) return
    void apiClient.updateUserPreferences(pending, token).then(() => {
      const current = preferencesRef.current
      const nextPending = { ...current.pending }
      if (pending.uiLocale === current.pending?.uiLocale) delete nextPending.uiLocale
      if (pending.contentLocale === current.pending?.contentLocale) delete nextPending.contentLocale
      persist({ ...current, pending: Object.keys(nextPending).length ? nextPending : undefined })
    }).catch(() => {
      // pending 已经写入本地；在下次取得有效会话时重试。
    })
  }, [persist])

  useEffect(() => {
    if (!languageReady || !authReady || !authToken) return
    let mounted = true
    void apiClient.getUserPreferences(authToken).then((serverPreferences) => {
      if (!mounted) return
      const pending = preferencesRef.current.pending
      const next: StoredLanguagePreferences = {
        uiLocale: pending?.uiLocale ?? serverPreferences.uiLocale,
        contentLocale: pending?.contentLocale ?? serverPreferences.contentLocale,
        pending,
      }
      persist(next)
      if (pending) syncPendingPreferences(authToken, pending)
    }).catch(() => {
      // 离线时继续使用本地选择，避免启动时重置语言。
    })
    return () => {
      mounted = false
    }
  }, [authReady, authToken, languageReady, persist, syncPendingPreferences])

  const updatePreferences = useCallback((patch: Partial<LanguagePreferences>) => {
    const current = preferencesRef.current
    const next: StoredLanguagePreferences = {
      ...current,
      ...patch,
      // 匿名用户的选择只是设备偏好。只有已有登录会话的离线改动才需要
      // 作为 pending 写回账号；首次登录应由该账号的云端偏好接管。
      pending: authToken ? { ...current.pending, ...patch } : undefined,
    }
    persist(next)
    if (authToken) syncPendingPreferences(authToken, patch)
  }, [authToken, persist, syncPendingPreferences])

  const value = useMemo<LanguageContextValue>(() => ({
    uiLocale: storedPreferences.uiLocale,
    contentLocale: storedPreferences.contentLocale,
    languageReady,
    setUiLocale: (locale) => updatePreferences({ uiLocale: locale }),
    setContentLocale: (locale) => updatePreferences({ contentLocale: locale }),
    t: (key, values) => {
      let message = messages[storedPreferences.uiLocale][key]
      if (!values) return message
      for (const [name, value] of Object.entries(values)) {
        message = message.replaceAll(`{{${name}}}`, String(value))
      }
      return message
    },
  }), [languageReady, storedPreferences.contentLocale, storedPreferences.uiLocale, updatePreferences])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider')
  return value
}
