import { LogIn, LogOut, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AuthResponse, AuthUser } from '@duolinting/shared'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'

type AuthDialogProps = {
  open: boolean
  user: AuthUser | null
  accountStatus: string
  onClose: () => void
  onAuthenticated: (response: AuthResponse) => void
  onLogout: () => void
}

export function AuthDialog({
  open,
  user,
  accountStatus,
  onClose,
  onAuthenticated,
  onLogout,
}: AuthDialogProps) {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<{
    email?: string
    displayName?: string
    password?: string
  }>({})

  const validateEmail = (email: string) => {
    if (!email) return t('auth.emailRequired')
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) return t('auth.emailInvalid')
    return ''
  }

  const validateDisplayName = (name: string) => {
    if (!name) return t('auth.displayNameRequired')
    if (name.length < 2) return t('auth.displayNameTooShort')
    if (name.length > 20) return t('auth.displayNameTooLong')
    const nameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/
    if (!nameRegex.test(name)) return t('auth.displayNameInvalidChars')
    return ''
  }

  const validatePassword = (pwd: string) => {
    if (!pwd) return t('auth.passwordRequired')
    if (pwd.length < 8) return t('auth.passwordTooShort')
    if (!/[a-zA-Z]/.test(pwd)) return t('auth.passwordNeedsLetter')
    if (!/\d/.test(pwd)) return t('auth.passwordNeedsDigit')
    return ''
  }

  const validateForm = () => {
    const newErrors: {
      email?: string
      displayName?: string
      password?: string
    } = {}

    const emailError = validateEmail(email)
    if (emailError) newErrors.email = emailError

    if (mode === 'register') {
      const displayNameError = validateDisplayName(displayName)
      if (displayNameError) newErrors.displayName = displayNameError
    }

    const passwordError = validatePassword(password)
    if (passwordError) newErrors.password = passwordError

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  const submit = async () => {
    if (!validateForm()) {
      return
    }

    setIsBusy(true)
    setMessage('')

    try {
      const response =
        mode === 'login'
          ? await apiClient.login({ email, password })
          : await apiClient.register({ email, displayName, password })
      onAuthenticated(response)
      setMessage(mode === 'login' ? t('auth.loggedIn') : t('auth.accountCreated'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('auth.actionFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="auth-dialog-title"
        aria-modal="true"
        className="auth-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          aria-label={t('auth.closeDialog')}
          className="dialog-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="dialog-hero">
          <p>{t('auth.accountCenter')}</p>
          <h2 id="auth-dialog-title">
            {user ? t('auth.linkedToAccount') : t('auth.loginToSave')}
          </h2>
          <span>{message || accountStatus}</span>
        </div>

        {user ? (
          <div className="signed-in-card">
            <div className="avatar-badge" aria-hidden="true">
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.email}</span>
            </div>
          </div>
        ) : (
          <div className="auth-form">
            <div className="auth-segmented" aria-label={t('auth.loginOrSignup')}>
              <button
                className={mode === 'login' ? 'active' : ''}
                onClick={() => setMode('login')}
                type="button"
              >
                {t('auth.login')}
              </button>
              <button
                className={mode === 'register' ? 'active' : ''}
                onClick={() => setMode('register')}
                type="button"
              >
                {t('auth.signup')}
              </button>
            </div>

            <label className="field">
              <span>{t('auth.email')}</span>
              <input
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setErrors((prev) => ({ ...prev, email: '' }))
                }}
                type="email"
              />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </label>
            {mode === 'register' && (
              <label className="field">
                <span>{t('auth.displayName')}</span>
                <input
                  autoComplete="nickname"
                  placeholder={t('auth.enterDisplayName')}
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value)
                    setErrors((prev) => ({ ...prev, displayName: '' }))
                  }}
                />
                {errors.displayName && <span className="field-error">{errors.displayName}</span>}
              </label>
            )}
            <label className="field">
              <span>{t('auth.password')}</span>
              <input
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                placeholder={mode === 'login' ? t('auth.enterPassword') : t('auth.passwordHint')}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setErrors((prev) => ({ ...prev, password: '' }))
                }}
                type="password"
              />
              {errors.password && <span className="field-error">{errors.password}</span>}
            </label>
          </div>
        )}

        <div className="dialog-actions">
          {user ? (
            <button className="danger-command" onClick={onLogout} type="button">
              <LogOut size={17} aria-hidden="true" />
              {t('auth.logout')}
            </button>
          ) : (
            <button
              className="command-button large full"
              disabled={isBusy}
              onClick={() => void submit()}
              type="button"
            >
              {mode === 'login' ? (
                <LogIn size={18} aria-hidden="true" />
              ) : (
                <UserPlus size={18} aria-hidden="true" />
              )}
              {mode === 'login' ? t('auth.login') : t('auth.createAccount')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
