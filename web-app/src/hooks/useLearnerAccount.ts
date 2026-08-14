import { useEffect, useRef, useState } from 'react'
import { AUTH_TOKEN_STORAGE_KEY } from '@duolinting/app-config'
import type { AuthResponse, AuthUser, StudyStore } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'

type UseLearnerAccountOptions = {
  store: StudyStore
  onStoreRestore: (store: StudyStore) => void
}

// 账号状态：要么是语义 key（交给 t() 翻译，切换语言时可自动重译），
// 要么是服务端返回的动态错误文案（error.message，原样透传不翻译）。
type AccountStatus = { key: string } | { raw: string }

export function useLearnerAccount({
  store,
  onStoreRestore,
}: UseLearnerAccountOptions) {
  const { t } = useLanguage()
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '',
  )
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [status, setStatus] = useState<AccountStatus>({ key: 'account.loggedOut' })
  const [progressSaveReady, setProgressSaveReady] = useState(false)
  const hasPulledProgressRef = useRef(false)

  // 渲染期统一求值：key 走 t() 翻译，raw 原样显示。
  const accountStatus = 'raw' in status ? status.raw : t(status.key)

  useEffect(() => {
    if (!authToken) {
      setAuthLoading(false)
      return
    }

    let mounted = true

    apiClient
      .getCurrentUser(authToken)
      .then((user) => {
        if (!mounted) {
          return
        }

        setAuthUser(user)
        setStatus({ key: 'account.loggedIn' })
        setAuthLoading(false)
      })
      .catch((error) => {
        if (!mounted) {
          return
        }

        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
        setAuthToken('')
        setAuthUser(null)
        setStatus(
          error instanceof Error
            ? { raw: error.message }
            : { key: 'account.sessionExpired' },
        )
        setAuthLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [authToken])

  useEffect(() => {
    if (!authToken || hasPulledProgressRef.current) {
      return
    }

    hasPulledProgressRef.current = true
    apiClient
      .getProgress(authToken)
      .then((response) => {
        if (response.store) {
          onStoreRestore(response.store)
          setStatus({ key: 'account.progressSynced' })
        } else {
          setStatus({ key: 'account.noRecords' })
        }
        setProgressSaveReady(true)
      })
      .catch((error) => {
        setStatus(
          error instanceof Error
            ? { raw: error.message }
            : { key: 'account.syncFailed' },
        )
        setProgressSaveReady(true)
      })
  }, [authToken, onStoreRestore])

  useEffect(() => {
    if (!authToken || !progressSaveReady) {
      return
    }

    const timeout = globalThis.setTimeout(() => {
      apiClient
        .saveProgress(store, authToken)
        .then(() => setStatus({ key: 'account.progressSaved' }))
        .catch((error) =>
          setStatus(
            error instanceof Error
              ? { raw: error.message }
              : { key: 'account.saveFailed' },
          ),
        )
    }, 800)

    return () => globalThis.clearTimeout(timeout)
  }, [authToken, progressSaveReady, store])

  const handleAuthenticated = (response: AuthResponse) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token)
    hasPulledProgressRef.current = false
    setProgressSaveReady(false)
    setAuthToken(response.token)
    setAuthUser(response.user)
    setStatus({ key: 'account.loggedIn' })
  }

  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    hasPulledProgressRef.current = false
    setProgressSaveReady(false)
    setAuthToken('')
    setAuthUser(null)
    setStatus({ key: 'account.loggedOut' })
  }

  return {
    accountStatus,
    authLoading,
    authToken,
    authUser,
    handleAuthenticated,
    handleLogout,
  }
}
