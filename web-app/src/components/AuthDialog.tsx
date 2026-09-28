import { ArrowLeft, LogOut, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AuthResponse, AuthUser } from '@duolinting/shared'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'
import { useToast } from './ToastProvider'
import { SocialAuthButtons } from './SocialAuthButtons'
import type { OAuthResult } from '@duolinting/domain'

type AuthDialogProps = {
  open: boolean
  user: AuthUser | null
  onClose: () => void
  onAuthenticated: (response: AuthResponse) => void
  onLogout: () => Promise<boolean> | boolean
}

type Step = 'entry' | 'code' | 'password' | 'link'
type Challenge = { id: number; email: string; expiresAt: number; retryAt: number }

export function AuthDialog({ open, user, onClose, onAuthenticated, onLogout }: AuthDialogProps) {
  const { t, uiLocale } = useLanguage()
  const { showToast } = useToast()
  const [step, setStep] = useState<Step>('entry')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const previousUserIdRef = useRef<number | null>(user?.id ?? null)
  const [pendingLink, setPendingLink] = useState<number | null>(null)
  const [linkAuth, setLinkAuth] = useState<AuthResponse | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const normalizedEmail = email.trim().toLowerCase()
  const retrySeconds = challenge ? Math.max(0, Math.ceil((challenge.retryAt - now) / 1000)) : 0
  const expiresSeconds = challenge ? Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000)) : 0

  useEffect(() => {
    // Once the signed-in owner leaves, discard the prior mailbox and any
    // unfinished challenge before showing the authentication form again.
    if (previousUserIdRef.current !== null && previousUserIdRef.current !== (user?.id ?? null)) {
      setStep('entry')
      setEmail('')
      setCode('')
      setPassword('')
      setChallenge(null)
      setPendingLink(null)
      setLinkAuth(null)
      setError('')
    }
    previousUserIdRef.current = user?.id ?? null
  }, [user])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const handleVisible = () => setNow(Date.now())
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [onClose, open])

  if (!open) return null

  const validEmail = () => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return true
    setError(t('auth.emailInvalid'))
    return false
  }

  const startEmail = async () => {
    if (isBusy || !validEmail()) return
    setIsBusy(true)
    setError('')
    try {
      const result = await apiClient.startEmailLogin({ email: normalizedEmail, uiLocale })
      if (!result.challengeId || !result.expiresAt || !result.retryAt) throw new Error('Missing email challenge')
      setChallenge({ id: result.challengeId, email: normalizedEmail, expiresAt: Date.parse(result.expiresAt), retryAt: Date.parse(result.retryAt) })
      setCode('')
      setNow(Date.now())
      setStep('code')
    } catch (failure) {
      const failureCode = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(failureCode === 'RATE_LIMITED' || failureCode === 'EMAIL_SEND_LIMITED' ? 'auth.codeRateLimited' : 'auth.codeSendFailed'))
    } finally { setIsBusy(false) }
  }

  const verify = async () => {
    if (isBusy || !challenge || challenge.expiresAt <= Date.now() || !/^\d{6}$/.test(code)) return
    setIsBusy(true)
    setError('')
    try {
      const response = linkAuth ?? await apiClient.verifyEmailLogin({ email: challenge.email, challengeId: challenge.id, code })
      if (pendingLink) {
        setLinkAuth(response)
        await apiClient.confirmOAuthLink(pendingLink, response.token)
        setPendingLink(null)
        setLinkAuth(null)
      }
      setCode('')
      onAuthenticated(response)
      showToast({ title: t('auth.toastSuccessTitle'), message: t('auth.loggedIn'), tone: 'success' })
    } catch (failure) {
      const failureCode = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(failureCode === 'EMAIL_CODE_EXPIRED' ? 'auth.codeExpired' : failureCode === 'EMAIL_CODE_LOCKED' ? 'auth.codeLocked' : 'auth.codeIncorrect'))
    } finally { setIsBusy(false) }
  }

  const loginWithPassword = async () => {
    if (isBusy || !password || !validEmail()) return
    setIsBusy(true)
    setError('')
    try {
      const response = await apiClient.passwordLogin({ email: normalizedEmail, password })
      if (pendingLink) {
        await apiClient.confirmOAuthLink(pendingLink, response.token)
        setPendingLink(null)
      }
      setPassword('')
      onAuthenticated(response)
      showToast({ title: t('auth.toastSuccessTitle'), message: t('auth.loggedIn'), tone: 'success' })
    } catch (failure) {
      const failureCode = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(failureCode === 'EMAIL_VERIFICATION_REQUIRED' ? 'auth.verifyExistingHint' : 'authFlow.passwordError'))
    }
    finally { setIsBusy(false) }
  }

  const openEmailCode = () => {
    setPassword('')
    setError('')
    if (challenge && challenge.email === normalizedEmail && challenge.expiresAt > Date.now()) setStep('code')
    else void startEmail()
  }

  const onSocialResult = (result: OAuthResult) => {
    if (result.status === 'authenticated') {
      onAuthenticated(result.auth)
      showToast({ title: t('auth.toastSuccessTitle'), message: t('auth.loggedIn'), tone: 'success' })
    } else if (result.status === 'needs_link' && result.emailHint) {
      setPendingLink(result.transactionId)
      setEmail(result.emailHint)
      setChallenge(null)
      setStep('link')
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section aria-labelledby="auth-dialog-title" aria-modal="true" className="auth-dialog" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
      <button aria-label={t('auth.closeDialog')} className="dialog-close" onClick={onClose} type="button"><X size={18} aria-hidden="true" /></button>
      <div className="dialog-hero">
        <p>{t('auth.accountCenter')}</p>
        <h2 id="auth-dialog-title">{user ? t('auth.linkedToAccount') : step === 'link' ? t('authFlow.linkTitle') : step === 'code' ? t(pendingLink ? 'authFlow.linkTitle' : 'authFlow.checkEmail') : step === 'password' ? t('authFlow.enterPassword') : t('authFlow.title')}</h2>
        <span>{user ? t('auth.secureHint') : step === 'link' ? t('authFlow.linkHint', { email: normalizedEmail }) : step === 'code' ? t('authFlow.sentTo', { email: challenge?.email ?? normalizedEmail }) : t('authFlow.subtitle')}</span>
      </div>
      {user ? <div className="signed-in-card">
        <div className="avatar-badge" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</div>
        <div><strong>{user.displayName}</strong>{user.email ? <span>{user.email}</span> : null}</div>
      </div> : <div className="auth-form">
        {step !== 'entry' ? <button className="auth-back" onClick={() => { setStep(step === 'link' ? 'entry' : pendingLink ? 'link' : 'entry'); if (step === 'link') setPendingLink(null); setPassword(''); setCode(''); setError('') }} type="button"><ArrowLeft size={16} aria-hidden="true" />{t('authFlow.changeEmail')}</button> : null}
        {step === 'entry' ? <>
          <label className="field"><span>{t('auth.email')}</span><input autoComplete="email" inputMode="email" placeholder="name@example.com" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setChallenge(null); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') void startEmail() }} /></label>
          <p className="auth-code-meta">{t('authFlow.emailHint')}</p>
          <button className="auth-forgot" onClick={() => { if (validEmail()) { setStep('password'); setError('') } }} type="button">{t('authFlow.passwordWay')}</button>
        </> : step === 'link' ? <p className="auth-code-meta">{t('authFlow.linkHint', { email: normalizedEmail })}</p> : step === 'code' ? <>
          <label className="field"><span>{t('auth.verificationCode')}</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder={t('auth.codePlaceholder')} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') void verify() }} /></label>
          <span className="auth-code-meta">{expiresSeconds > 0 ? t('auth.codeExpiresIn', { minutes: String(Math.floor(expiresSeconds / 60)).padStart(2, '0'), seconds: String(expiresSeconds % 60).padStart(2, '0') }) : t('auth.codeExpired')}</span>
          <button className="auth-forgot" disabled={isBusy || retrySeconds > 0} onClick={() => void startEmail()} type="button">{retrySeconds > 0 ? t('auth.resendIn', { seconds: retrySeconds }) : t('authFlow.resend')}</button>
          <button className="auth-forgot" onClick={() => { setStep('password'); setCode(''); setError('') }} type="button">{t('authFlow.passwordWay')}</button>
        </> : <>
          <p className="auth-code-meta">{normalizedEmail}</p>
          <label className="field"><span>{t('auth.password')}</span><input autoComplete="current-password" placeholder={t('auth.enterPassword')} type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') void loginWithPassword() }} /></label>
          <button className="auth-forgot" onClick={openEmailCode} type="button">{t('authFlow.passwordFallback')}</button>
        </>}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
      </div>}
      {!user && step === 'entry' ? <SocialAuthButtons onResult={onSocialResult} onError={() => setError(t('authFlow.socialFailed'))} /> : null}
      <div className="dialog-actions">{user ?
        <button className="danger-command" onClick={() => { void Promise.resolve(onLogout()).then((done) => { if (done) showToast({ title: t('auth.toastNoticeTitle'), message: t('auth.loggedOutToast'), tone: 'info' }); else showToast({ title: t('auth.toastErrorTitle'), message: t('account.logoutFailed'), tone: 'error' }) }) }} type="button"><LogOut size={17} aria-hidden="true" />{t('auth.logout')}</button>
        : <button className="command-button large full" disabled={isBusy || (step === 'code' && (code.length !== 6 || expiresSeconds === 0))} onClick={() => void (step === 'entry' || step === 'link' ? startEmail() : step === 'code' ? verify() : loginWithPassword())} type="button">{step === 'entry' ? t('authFlow.continue') : step === 'link' || step === 'code' && pendingLink ? t('authFlow.linkContinue') : step === 'code' ? t('authFlow.verifyContinue') : t('auth.login')}</button>}
      </div>
    </section>
  </div>
}
