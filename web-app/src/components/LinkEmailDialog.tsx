import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'
import { WebReauthForm } from './WebReauthForm'

export function LinkEmailDialog({ open, authToken, onClose, onLinked }: {
  open: boolean
  authToken: string
  onClose: () => void
  onLinked: () => void
}) {
  const { t, uiLocale } = useLanguage()
  const [ticket, setTicket] = useState('')
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    const initialTick = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const visible = () => setNow(Date.now())
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearTimeout(initialTick)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [open])
  if (!open) return null
  const close = () => { setTicket(''); setEmail(''); setCode(''); setChallengeId(null); setError(''); onClose() }
  const normalizedEmail = email.trim().toLowerCase()
  const start = async () => {
    if (busy) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError(t('auth.emailInvalid')); return }
    setBusy(true); setError('')
    try {
      const result = await apiClient.startEmailLink({ email: normalizedEmail, uiLocale }, authToken)
      if (!result.challengeId) throw new Error('Missing challenge')
      setChallengeId(result.challengeId); setRetryAt(Date.parse(result.retryAt)); setExpiresAt(Date.parse(result.expiresAt)); setCode('')
    } catch (failure) {
      const code = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(code === 'EMAIL_SEND_LIMITED' || code === 'RATE_LIMITED' ? 'auth.codeRateLimited' : 'auth.codeSendFailed'))
    }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!challengeId || code.length !== 6 || !ticket || busy) return
    setBusy(true); setError('')
    try {
      await apiClient.confirmEmailLink({ email: normalizedEmail, challengeId, code, reauthTicket: ticket }, authToken)
      close(); onLinked()
    } catch (failure) {
      const failureCode = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      if (failureCode === 'REAUTH_REQUIRED') setTicket('')
      setError(t(failureCode === 'EMAIL_ALREADY_REGISTERED' ? 'authSecurity.emailCollision' : failureCode === 'REAUTH_REQUIRED' ? 'authSecurity.actionFailed' : 'auth.codeIncorrect'))
    } finally { setBusy(false) }
  }
  const expiresSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section aria-labelledby="link-email-title" aria-modal="true" className="auth-dialog settings-dialog" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
    <button aria-label={t('auth.closeDialog')} className="dialog-close" onClick={close} type="button"><X size={18} aria-hidden="true" /></button>
    <div className="dialog-hero"><p>{t('settings.account')}</p><h2 id="link-email-title">{t('authSecurity.linkEmail')}</h2><span>{t('authSecurity.linkEmailHint')}</span></div>
    {ticket ? <div className="auth-form"><label className="settings-field"><span className="settings-field-label">{t('auth.email')}</span><input autoComplete="email" className="settings-input" onChange={(event) => { setEmail(event.target.value); setChallengeId(null); setError('') }} type="email" value={email} /></label>
      <button className="auth-forgot" disabled={busy || retryAt > now} onClick={() => void start()} type="button">{retryAt > now ? t('auth.resendIn', { seconds: Math.ceil((retryAt - now) / 1000) }) : t('auth.sendCode')}</button>
      {challengeId ? <label className="settings-field"><span className="settings-field-label">{t('auth.verificationCode')}</span><input autoComplete="one-time-code" className="settings-input" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} value={code} /></label> : null}
      {challengeId ? <span className="auth-code-meta">{expiresSeconds > 0 ? t('auth.codeExpiresIn', { minutes: String(Math.floor(expiresSeconds / 60)).padStart(2, '0'), seconds: String(expiresSeconds % 60).padStart(2, '0') }) : t('auth.codeExpired')}</span> : null}
      {challengeId ? <button className="settings-submit" disabled={busy || code.length !== 6 || expiresSeconds === 0} onClick={() => void confirm()} type="button">{t('authFlow.linkContinue')}</button> : null}</div>
      : <WebReauthForm purpose="link_email" authToken={authToken} onTicket={setTicket} />}
    {error ? <p className="settings-message error" role="alert">{error}</p> : null}
  </section></div>
}
