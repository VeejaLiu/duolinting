import { ArrowLeft, KeyRound, LogIn, LogOut, Mail, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AuthResponse, AuthUser } from '@duolinting/shared'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'
import { useToast } from './ToastProvider'

type AuthDialogProps = {
  open: boolean
  user: AuthUser | null
  onClose: () => void
  onAuthenticated: (response: AuthResponse) => void
  onLogout: () => void
}

type AuthMode = 'login' | 'register' | 'forgot'

export function AuthDialog({
  open,
  user,
  onClose,
  onAuthenticated,
  onLogout,
}: AuthDialogProps) {
  const { t, uiLocale } = useLanguage()
  const { showToast } = useToast()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationRequired, setVerificationRequired] = useState(true)
  const [mode, setMode] = useState<AuthMode>('login')
  const [isBusy, setIsBusy] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [codeExpiresSeconds, setCodeExpiresSeconds] = useState(0)
  const [hourlyLimit, setHourlyLimit] = useState(6)
  const countdownActive = resendSeconds > 0 || codeExpiresSeconds > 0
  const [errors, setErrors] = useState<{
    email?: string
    displayName?: string
    password?: string
    verificationCode?: string
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

  const localizedAuthError = (error: unknown, fallbackKey: Parameters<typeof t>[0]) => {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : ''
    const keyByCode: Record<string, Parameters<typeof t>[0]> = {
      EMAIL_ALREADY_REGISTERED: 'auth.emailAlreadyRegistered',
      EMAIL_CODE_REQUIRED: 'auth.codeInvalid',
      EMAIL_CODE_INVALID: 'auth.codeIncorrect',
      EMAIL_CODE_EXPIRED: 'auth.codeExpired',
      EMAIL_CODE_LOCKED: 'auth.codeLocked',
      EMAIL_SERVICE_UNAVAILABLE: 'auth.emailServiceUnavailable',
      RATE_LIMITED: 'auth.codeRateLimited',
      INVALID_CREDENTIALS: 'auth.invalidCredentials',
    }
    return code && keyByCode[code]
      ? t(keyByCode[code])
      : error instanceof Error
        ? error.message
        : t(fallbackKey)
  }

  const validateForm = () => {
    const newErrors: {
      email?: string
      displayName?: string
      password?: string
      verificationCode?: string
    } = {}

    const emailError = validateEmail(email)
    if (emailError) newErrors.email = emailError

    if (mode === 'register') {
      const displayNameError = validateDisplayName(displayName)
      if (displayNameError) newErrors.displayName = displayNameError
    }

    const passwordError = validatePassword(password)
    if (passwordError) newErrors.password = passwordError

    if (mode !== 'login' && verificationRequired && !/^\d{6}$/.test(verificationCode)) {
      newErrors.verificationCode = t('auth.codeInvalid')
    }

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

  useEffect(() => {
    if (!countdownActive) return
    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1))
      setCodeExpiresSeconds((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [countdownActive])

  if (!open) {
    return null
  }

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setErrors({})
    setVerificationCode('')
    setVerificationRequired(true)
    setResendSeconds(0)
    setCodeExpiresSeconds(0)
    if (nextMode === 'forgot') setPassword('')
  }

  const requestCode = async () => {
    const emailError = validateEmail(email)
    if (emailError) {
      setErrors((current) => ({ ...current, email: emailError }))
      return
    }

    setIsSendingCode(true)
    try {
      const result = await apiClient.requestEmailCode({
        email: email.trim().toLowerCase(),
        purpose: mode === 'forgot' ? 'password_reset' : 'register',
        uiLocale,
      })
      setVerificationRequired(result.verificationRequired)
      setResendSeconds(result.retryAfterSeconds ?? 0)
      setCodeExpiresSeconds(result.expiresInSeconds)
      setHourlyLimit(result.hourlyLimit ?? 6)
      const message = result.delivery === 'disabled'
        ? t('auth.codeNotRequired')
        : result.delivery === 'cooldown'
          ? t('auth.codeCooldown', { seconds: result.retryAfterSeconds ?? 60 })
          : t('auth.codeSent')
      showToast({
        title: t(result.delivery === 'sent' ? 'auth.toastSentTitle' : 'auth.toastNoticeTitle'),
        message,
        tone: result.delivery === 'sent' ? 'success' : 'info',
      })
    } catch (error) {
      showToast({
        title: t('auth.toastErrorTitle'),
        message: localizedAuthError(error, 'auth.codeSendFailed'),
        tone: 'error',
      })
    } finally {
      setIsSendingCode(false)
    }
  }

  const submit = async () => {
    if (!validateForm()) {
      return
    }

    setIsBusy(true)

    try {
      if (mode === 'forgot') {
        await apiClient.resetPassword({
          email: email.trim().toLowerCase(),
          verificationCode,
          newPassword: password,
        })
        setPassword('')
        setVerificationCode('')
        setMode('login')
        setResendSeconds(0)
        setCodeExpiresSeconds(0)
        showToast({ title: t('auth.toastSuccessTitle'), message: t('auth.passwordResetComplete'), tone: 'success' })
        return
      }

      const response = mode === 'login'
        ? await apiClient.login({ email, password })
        : await apiClient.register({
            email,
            displayName,
            password,
            ...(verificationRequired ? { verificationCode } : {}),
          })
      onAuthenticated(response)
      showToast({
        title: t('auth.toastSuccessTitle'),
        message: mode === 'login' ? t('auth.loggedIn') : t('auth.accountCreated'),
        tone: 'success',
      })
    } catch (error) {
      showToast({
        title: t('auth.toastErrorTitle'),
        message: localizedAuthError(error, 'auth.actionFailed'),
        tone: 'error',
      })
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
            {user
              ? t('auth.linkedToAccount')
              : mode === 'forgot'
                ? t('auth.resetPasswordTitle')
                : t('auth.loginToSave')}
          </h2>
          <span>{t('auth.secureHint')}</span>
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
            {mode === 'forgot' ? (
              <button className="auth-back" onClick={() => selectMode('login')} type="button">
                <ArrowLeft size={16} aria-hidden="true" />
                {t('auth.backToLogin')}
              </button>
            ) : (
              <div className="auth-segmented" aria-label={t('auth.loginOrSignup')}>
                <button
                  className={mode === 'login' ? 'active' : ''}
                  onClick={() => selectMode('login')}
                  type="button"
                >
                  {t('auth.login')}
                </button>
                <button
                  className={mode === 'register' ? 'active' : ''}
                  onClick={() => selectMode('register')}
                  type="button"
                >
                  {t('auth.signup')}
                </button>
              </div>
            )}

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
            {mode !== 'login' && verificationRequired && (
              <label className="field">
                <span>{t('auth.verificationCode')}</span>
                <div className="auth-code-row">
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t('auth.codePlaceholder')}
                    value={verificationCode}
                    onChange={(event) => {
                      setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                      setErrors((current) => ({ ...current, verificationCode: '' }))
                    }}
                  />
                  <button disabled={isSendingCode || resendSeconds > 0} onClick={() => void requestCode()} type="button">
                    <Mail size={16} aria-hidden="true" />
                    {isSendingCode
                      ? t('auth.sendingCode')
                      : resendSeconds > 0
                        ? t('auth.resendIn', { seconds: resendSeconds })
                        : t('auth.sendCode')}
                  </button>
                </div>
                <span className="auth-code-meta">
                  {codeExpiresSeconds > 0
                    ? t('auth.codeExpiresIn', {
                        minutes: String(Math.floor(codeExpiresSeconds / 60)).padStart(2, '0'),
                        seconds: String(codeExpiresSeconds % 60).padStart(2, '0'),
                      })
                    : t('auth.codeValidity', { minutes: 10, count: hourlyLimit })}
                </span>
                {errors.verificationCode && <span className="field-error">{errors.verificationCode}</span>}
              </label>
            )}
            <label className="field">
              <span>{mode === 'forgot' ? t('auth.newPassword') : t('auth.password')}</span>
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
            {mode === 'login' && (
              <button className="auth-forgot" onClick={() => selectMode('forgot')} type="button">
                {t('auth.forgotPassword')}
              </button>
            )}
          </div>
        )}

        <div className="dialog-actions">
          {user ? (
            <button className="danger-command" onClick={() => {
              onLogout()
              showToast({ title: t('auth.toastNoticeTitle'), message: t('auth.loggedOutToast'), tone: 'info' })
            }} type="button">
              <LogOut size={17} aria-hidden="true" />
              {t('auth.logout')}
            </button>
          ) : (
            <button
              className="command-button large full"
              disabled={isBusy || isSendingCode}
              onClick={() => void submit()}
              type="button"
            >
              {mode === 'login' ? (
                <LogIn size={18} aria-hidden="true" />
              ) : mode === 'forgot' ? (
                <KeyRound size={18} aria-hidden="true" />
              ) : (
                <UserPlus size={18} aria-hidden="true" />
              )}
              {mode === 'login'
                ? t('auth.login')
                : mode === 'forgot'
                  ? t('auth.resetPassword')
                  : t('auth.createAccount')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
