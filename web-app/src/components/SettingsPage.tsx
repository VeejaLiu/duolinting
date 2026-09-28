import { ArrowLeft, ChevronRight, KeyRound, Languages } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AUTH_TOKEN_STORAGE_KEY } from '@duolinting/app-config'
import type { AuthMethods, AuthResponse, AuthUser, ContentLocale, UiLocale } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'
import { contentLocaleLabels, uiLocaleLabels, useLanguage } from '../i18n/LanguageProvider'
import { AuthDialog } from './AuthDialog'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { SecurityActionDialog } from './SecurityActionDialog'
import { SocialAuthButtons } from './SocialAuthButtons'
import { LinkEmailDialog } from './LinkEmailDialog'
import { SettingsSelect } from './SettingsSelect'
import { TopBar } from './TopBar'
import { useToast } from './ToastProvider'
import { ApiClientError } from '@duolinting/api-client'

/**
 * 设置页：挂在 TopBar 下面，与主学习页共用同一个应用外壳。
 * 账号状态在本页独立维护（token 与 useLearnerAccount 共用同一个
 * localStorage key）：TopBar 的登录/显示名、修改密码表单都依赖它。
 * 语言改动在登录状态下同步服务端偏好，未登录只保存在本机。
 */
export function SettingsPage() {
  const navigate = useNavigate()
  const { contentLocale, setContentLocale, setUiLocale, t, uiLocale } = useLanguage()
  const { showToast } = useToast()
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '',
  )
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [linkEmailOpen, setLinkEmailOpen] = useState(false)
  const [authMethods, setAuthMethods] = useState<AuthMethods | null>(null)
  const [securityAction, setSecurityAction] = useState<{ kind: 'delete' } | { kind: 'unlink'; provider: 'apple' | 'google' } | null>(null)

  // 进入页面时用本地 token 恢复登录身份；失效则清掉，回到未登录形态
  useEffect(() => {
    if (!authToken) return
    let mounted = true
    apiClient.getCurrentUser(authToken).then((user) => {
      if (mounted) setAuthUser(user)
    }).catch(() => {
      if (!mounted) return
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      setAuthToken('')
      setAuthUser(null)
    })
    return () => { mounted = false }
  }, [authToken])

  useEffect(() => {
    if (!authToken) { setAuthMethods(null); return }
    let active = true
    void apiClient.getAuthMethods(authToken).then((value) => { if (active) setAuthMethods(value) }).catch(() => { if (active) setAuthMethods(null) })
    return () => { active = false }
  }, [authToken])

  const handleAuthenticated = (response: AuthResponse) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token)
    setAuthToken(response.token)
    setAuthUser(response.user)
    void apiClient.getAuthMethods(response.token).then(setAuthMethods).catch(() => {})
  }

  const clearLocalSession = () => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    setAuthToken('')
    setAuthUser(null)
    setAuthMethods(null)
  }
  const handleLogout = async (): Promise<boolean> => {
    if (authToken) {
      try { await apiClient.logout(authToken) }
      catch (error) {
        if (!(error instanceof ApiClientError && error.status === 401)) {
          showToast({ title: t('auth.toastErrorTitle'), message: t('account.logoutFailed'), tone: 'error' })
          return false
        }
      }
    }
    clearLocalSession()
    return true
  }

  const persistLanguage = (next: { uiLocale?: UiLocale; contentLocale?: ContentLocale }) => {
    if (authToken) void apiClient.updateUserPreferences(next, authToken).catch(() => undefined)
  }

  const handleUiLocaleChange = (locale: UiLocale) => {
    setUiLocale(locale)
    persistLanguage({ uiLocale: locale })
  }

  const handleContentLocaleChange = (locale: ContentLocale) => {
    setContentLocale(locale)
    persistLanguage({ contentLocale: locale })
  }

  return (
    <div className="settings-page">
      <TopBar
        user={authUser}
        onLogout={handleLogout}
        onOpenAccount={() => setAccountDialogOpen(true)}
      />
      <AuthDialog
        onAuthenticated={handleAuthenticated}
        onClose={() => setAccountDialogOpen(false)}
        onLogout={handleLogout}
        open={accountDialogOpen}
        user={authUser}
      />

      <div className="settings-container">
        <header className="settings-header">
          <button
            aria-label={t('settings.back')}
            className="settings-back"
            onClick={() => navigate(-1)}
            type="button"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="settings-title">{t('settings.title')}</h1>
        </header>

        <section className="settings-card">
          <h2 className="settings-card-title">
            <Languages size={15} />
            {t('settings.language')}
          </h2>
          <label className="settings-field">
            <span className="settings-field-label">{t('interfaceLanguage')}</span>
            <SettingsSelect
              ariaLabel={t('interfaceLanguage')}
              onChange={(value) => handleUiLocaleChange(value as UiLocale)}
              options={Object.entries(uiLocaleLabels).map(([locale, label]) => ({ value: locale, label }))}
              value={uiLocale}
            />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">{t('contentLanguage')}</span>
            <SettingsSelect
              ariaLabel={t('contentLanguage')}
              onChange={(value) => handleContentLocaleChange(value as ContentLocale)}
              options={Object.entries(contentLocaleLabels).map(([locale, label]) => ({ value: locale, label }))}
              value={contentLocale}
            />
          </label>
        </section>

        <section className="settings-card">
          <h2 className="settings-card-title">
            <KeyRound size={15} />
            {t('settings.account')}
          </h2>
          {authToken && authUser?.email ? (
            <button
              className="settings-row"
              onClick={() => setPasswordDialogOpen(true)}
              type="button"
            >
              <span className="settings-row-icon" aria-hidden="true">
                <KeyRound size={17} />
              </span>
              <span className="settings-row-copy">
                <strong>{t(authMethods?.password === false ? 'authSecurity.setPassword' : 'settings.changePassword')}</strong>
                <span>{t('settings.changePasswordDescription')}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ) : authToken ? (
            <button className="settings-row" onClick={() => setLinkEmailOpen(true)} type="button">
              <span className="settings-row-icon" aria-hidden="true"><KeyRound size={17} /></span>
              <span className="settings-row-copy"><strong>{t('authSecurity.setPassword')}</strong><span>{t('authSecurity.linkEmailHint')}</span></span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <p className="settings-message error">{t('settings.loginRequired')}</p>
          )}
          {authToken && authMethods ? <>
            <h3 className="settings-card-title">{t('authSecurity.methods')}</h3>
            {authUser?.email ? <p className="settings-field-hint">{t('auth.email')}: {authUser.email}</p>
              : <button className="settings-row" onClick={() => setLinkEmailOpen(true)} type="button"><span className="settings-row-copy"><strong>{t('authSecurity.linkEmail')}</strong><span>{t('authSecurity.linkEmailHint')}</span></span><ChevronRight size={16} aria-hidden="true" /></button>}
            {(['apple', 'google'] as const).map((provider) => <div className="settings-row" key={provider}>
              <span className="settings-row-copy"><strong>{provider === 'apple' ? 'Apple' : 'Google'}</strong><span>{t(authMethods[provider] ? 'authSecurity.enabled' : 'authSecurity.disabled')}{authMethods.providerEmails[provider] ? ` · ${authMethods.providerEmails[provider]}` : ''}</span></span>
              {authMethods[provider] ? <button className="auth-forgot" onClick={() => setSecurityAction({ kind: 'unlink', provider })} type="button">{t('authSecurity.unlink')}</button> : null}
            </div>)}
            <SocialAuthButtons purpose="link" authToken={authToken} allowedProviders={(['apple', 'google'] as const).filter((provider) => !authMethods[provider]) as ('apple' | 'google')[]}
              onResult={(result) => { if (result.status === 'linked') void apiClient.getAuthMethods(authToken).then(setAuthMethods) }}
              onError={() => showToast({ title: t('auth.toastErrorTitle'), message: t('authFlow.socialFailed'), tone: 'error' })} />
            <button className="settings-row" onClick={() => setSecurityAction({ kind: 'delete' })} type="button">
              <span className="settings-row-copy"><strong>{t('authSecurity.delete')}</strong><span>{t('authSecurity.deleteHint')}</span></span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </> : null}
        </section>
        <ChangePasswordDialog
          authToken={authToken}
          onClose={() => setPasswordDialogOpen(false)}
          onAuthenticated={handleAuthenticated}
          hasPassword={authMethods?.password ?? true}
          open={passwordDialogOpen}
        />
        <SecurityActionDialog action={securityAction} authToken={authToken} onClose={() => setSecurityAction(null)} onDone={(deleted) => {
          setSecurityAction(null)
          if (deleted) clearLocalSession()
          else void apiClient.getAuthMethods(authToken).then(setAuthMethods)
        }} />
        <LinkEmailDialog open={linkEmailOpen} authToken={authToken} onClose={() => setLinkEmailOpen(false)} onLinked={() => {
          void apiClient.getCurrentUser(authToken).then(setAuthUser)
          void apiClient.getAuthMethods(authToken).then(setAuthMethods)
        }} />
      </div>
    </div>
  )
}
