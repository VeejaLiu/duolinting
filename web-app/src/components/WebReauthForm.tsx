import { useEffect, useState } from 'react'
import type { AuthMethods, ReauthPurpose } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'
import { SocialAuthButtons } from './SocialAuthButtons'

export function WebReauthForm({ purpose, authToken, onTicket }: { purpose: ReauthPurpose; authToken: string; onTicket: (ticket: string) => void }) {
  const { t, uiLocale } = useLanguage()
  const [methods, setMethods] = useState<AuthMethods | null>(null)
  const [method, setMethod] = useState<'password' | 'email_code'>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [retryAt, setRetryAt] = useState(0)
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void apiClient.getAuthMethods(authToken).then((value) => {
      if (active) { setMethods(value); setMethod(value.password ? 'password' : 'email_code') }
    }).catch(() => { if (active) setError(t('settings.changeFailed')) })
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const onVisible = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [authToken, t])

  const requestCode = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await apiClient.startReauthEmail(purpose, uiLocale, authToken)
      if (!result.challengeId) throw new Error('Missing challenge')
      setChallengeId(result.challengeId)
      setRetryAt(Date.parse(result.retryAt))
      setExpiresAt(Date.parse(result.expiresAt))
      setCode('')
    } catch (failure) {
      const code = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(code === 'EMAIL_SEND_LIMITED' || code === 'RATE_LIMITED' ? 'auth.codeRateLimited' : 'auth.codeSendFailed'))
    }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await apiClient.reauth(method === 'password'
        ? { purpose, method, password }
        : { purpose, method, challengeId: challengeId ?? undefined, code }, authToken)
      setPassword(''); setCode('')
      onTicket(result.ticket)
    } catch { setError(t(method === 'password' ? 'auth.invalidCredentials' : 'auth.codeIncorrect')) }
    finally { setBusy(false) }
  }

  if (!methods) return <p className="settings-message">{error || t('settings.submitting')}</p>
  const expiresSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return <div className="web-reauth-form">
    <p className="settings-field-hint">{t('settings.account')}</p>
    {methods.password ? <label className="settings-field"><input checked={method === 'password'} onChange={() => { setMethod('password'); setError('') }} type="radio" />{t('authFlow.passwordWay')}</label> : null}
    {methods.email ? <label className="settings-field"><input checked={method === 'email_code'} onChange={() => { setMethod('email_code'); setError('') }} type="radio" />{t('auth.verificationCode')}</label> : null}
    {method === 'password' && methods.password ? <label className="settings-field"><span className="settings-field-label">{t('auth.password')}</span><input autoComplete="current-password" className="settings-input" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label> : null}
    {method === 'email_code' && methods.email ? <>
      <button className="auth-forgot" disabled={busy || retryAt > now} onClick={() => void requestCode()} type="button">{retryAt > now ? t('auth.resendIn', { seconds: Math.ceil((retryAt - now) / 1000) }) : t('auth.sendCode')}</button>
      {challengeId ? <label className="settings-field"><span className="settings-field-label">{t('auth.verificationCode')}</span><input autoComplete="one-time-code" className="settings-input" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} value={code} /></label> : null}
      {challengeId ? <span className="auth-code-meta">{expiresSeconds > 0 ? t('auth.codeExpiresIn', { minutes: String(Math.floor(expiresSeconds / 60)).padStart(2, '0'), seconds: String(expiresSeconds % 60).padStart(2, '0') }) : t('auth.codeExpired')}</span> : null}
    </> : null}
    {methods.password || methods.email ? <button className="settings-submit" disabled={busy || (method === 'password' ? !password : code.length !== 6 || !challengeId || expiresSeconds === 0)} onClick={() => void confirm()} type="button">{t('authFlow.continue')}</button> : null}
    <SocialAuthButtons purpose="reauth" reauthPurpose={purpose} authToken={authToken} allowedProviders={(['apple', 'google'] as const).filter((provider) => methods[provider]) as ('apple' | 'google')[]} onResult={(result) => { if (result.status === 'reauthenticated') onTicket(result.ticket) }} onError={() => setError(t('authFlow.socialFailed'))} />
    {error ? <p className="settings-message error" role="alert">{error}</p> : null}
  </div>
}
