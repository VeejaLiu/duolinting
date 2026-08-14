import { ArrowLeft, ChevronRight, KeyRound, Languages } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AUTH_TOKEN_STORAGE_KEY } from '@duolinting/app-config'
import type { AuthResponse, AuthUser, ContentLocale, UiLocale } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'
import { contentLocaleLabels, uiLocaleLabels, useLanguage } from '../i18n/LanguageProvider'
import { AuthDialog } from './AuthDialog'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { SettingsSelect } from './SettingsSelect'
import { TopBar } from './TopBar'

/**
 * 设置页：挂在 TopBar 下面，与主学习页共用同一个应用外壳。
 * 账号状态在本页独立维护（token 与 useLearnerAccount 共用同一个
 * localStorage key）：TopBar 的登录/显示名、修改密码表单都依赖它。
 * 语言改动在登录状态下同步服务端偏好，未登录只保存在本机。
 */
export function SettingsPage() {
  const navigate = useNavigate()
  const { contentLocale, setContentLocale, setUiLocale, t, uiLocale } = useLanguage()
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '',
  )
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)

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

  const handleAuthenticated = (response: AuthResponse) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token)
    setAuthToken(response.token)
    setAuthUser(response.user)
  }

  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    setAuthToken('')
    setAuthUser(null)
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
        accountStatus={authUser ? t('account.loggedIn') : t('account.loggedOut')}
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
          {authToken ? (
            <button
              className="settings-row"
              onClick={() => setPasswordDialogOpen(true)}
              type="button"
            >
              <span className="settings-row-icon" aria-hidden="true">
                <KeyRound size={17} />
              </span>
              <span className="settings-row-copy">
                <strong>{t('settings.changePassword')}</strong>
                <span>{t('settings.changePasswordDescription')}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <p className="settings-message error">{t('settings.loginRequired')}</p>
          )}
        </section>
        <ChangePasswordDialog
          authToken={authToken}
          onClose={() => setPasswordDialogOpen(false)}
          open={passwordDialogOpen}
        />
      </div>
    </div>
  )
}
