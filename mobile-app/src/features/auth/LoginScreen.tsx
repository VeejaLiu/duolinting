import { useEffect, useState } from 'react'
import { AppState, Text, View } from 'react-native'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { Button } from '@/components/foundation/Button'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'
import { AuthEntryScreen } from './AuthEntryScreen'
import { EmailCodeScreen } from './EmailCodeScreen'
import { PasswordLoginScreen } from './PasswordLoginScreen'
import { useEmailStartMutation, useEmailVerifyMutation, usePasswordLoginMutation } from './hooks'
import { useAuthFlow } from './useAuthFlow'
import { apiClient } from '@/lib/apiClient'
import type { AuthResponse, OAuthProvider } from '@duolinting/domain'
import { LinkAccountScreen } from './LinkAccountScreen'

type Step = 'entry' | 'code' | 'password' | 'link'
type Challenge = { id: number; email: string; expiresAt: number; retryAt: number }

export function LoginScreen() {
  const { t, uiLocale } = useLanguage()
  const authRecoveryError = useAuthStore((state) => state.authRecoveryError)
  const authReady = useAuthStore((state) => state.authReady)
  const restoreSession = useAuthStore((state) => state.restoreSession)
  const abandonSession = useAuthStore((state) => state.logout)
  const applyAuthenticated = useAuthStore((state) => state.applyAuthenticated)
  const social = useAuthFlow()
  const startMutation = useEmailStartMutation()
  const verifyMutation = useEmailVerifyMutation()
  const passwordMutation = usePasswordLoginMutation()
  const [step, setStep] = useState<Step>('entry')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [pendingLink, setPendingLink] = useState<number | null>(null)
  const [linkAuth, setLinkAuth] = useState<AuthResponse | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const busy = startMutation.isPending || verifyMutation.isPending || passwordMutation.isPending || social.busy
  const normalizedEmail = email.trim().toLowerCase()

  // Server deadlines survive app suspension; recompute after returning.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    const subscription = AppState.addEventListener('change', () => setNow(Date.now()))
    return () => { clearInterval(timer); subscription.remove() }
  }, [])

  const validEmail = () => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return true
    setError(t('auth.invalidEmail'))
    return false
  }

  const startEmail = async () => {
    if (busy || !validEmail()) return
    setError('')
    try {
      const result = await startMutation.mutateAsync({ email: normalizedEmail, uiLocale })
      if (!Number.isSafeInteger(result.challengeId) || result.challengeId <= 0 || !result.expiresAt || !result.retryAt) {
        setError(t('auth.codeSendFailed'))
        return
      }
      setChallenge({ id: result.challengeId, email: normalizedEmail,
        expiresAt: Date.parse(result.expiresAt), retryAt: Date.parse(result.retryAt) })
      setNow(Date.now())
      setCode('')
      setStep('code')
    } catch (failure) {
      const failureCode = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(failureCode === 'RATE_LIMITED' || failureCode === 'EMAIL_SEND_LIMITED' ? 'auth.codeRateLimited' : 'auth.codeSendFailed'))
    }
  }

  const verify = async () => {
    if (busy || !challenge || challenge.expiresAt <= Date.now() || code.length !== 6) return
    setError('')
    try {
      if (pendingLink) {
        const response = linkAuth ?? await apiClient.verifyEmailLogin({ email: challenge.email, challengeId: challenge.id, code })
        setLinkAuth(response)
        await apiClient.confirmOAuthLink(pendingLink, response.token)
        await applyAuthenticated(response)
        setPendingLink(null)
        setLinkAuth(null)
      } else {
        await verifyMutation.mutateAsync({ email: challenge.email, challengeId: challenge.id, code })
      }
      setCode('')
    } catch (failure) {
      const failureCode = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(failureCode === 'EMAIL_CODE_EXPIRED' ? 'auth.codeExpired' : failureCode === 'EMAIL_CODE_LOCKED' ? 'auth.codeLocked' : 'auth.codeIncorrect'))
    }
  }

  const loginWithPassword = async () => {
    if (busy || !password || !validEmail()) return
    setError('')
    try {
      if (pendingLink) {
        const response = await apiClient.passwordLogin({ email: normalizedEmail, password })
        await apiClient.confirmOAuthLink(pendingLink, response.token)
        await applyAuthenticated(response)
        setPendingLink(null)
      } else {
        await passwordMutation.mutateAsync({ email: normalizedEmail, password })
      }
      setPassword('')
    } catch (failure) {
      const failureCode = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(failureCode === 'EMAIL_VERIFICATION_REQUIRED' ? 'auth.verifyExistingHint' : 'authFlow.passwordError'))
    }
  }

  const startSocial = async (provider: OAuthProvider) => {
    setError('')
    try {
      const result = await social.run(provider)
      if (result?.status === 'needs_link' && result.emailHint) {
        setPendingLink(result.transactionId)
        setEmail(result.emailHint)
        setChallenge(null)
        setStep('link')
      }
    } catch { setError(t('authFlow.socialFailed')) }
  }

  if (!authReady) return <SafeScreen><View className="flex-1 items-center justify-center bg-[#f7fbff] px-5"><Text className="text-base text-text-secondary">{t('account.restoring')}</Text></View></SafeScreen>

  if (authRecoveryError) return <SafeScreen><View className="flex-1 justify-center bg-[#f7fbff] px-5">
    <Text className="text-center text-2xl font-black text-text-primary">{t('auth.restoreFailedTitle')}</Text>
    <Text className="mt-3 text-center text-base text-text-secondary">{t('auth.restoreFailedBody')}</Text>
    <View className="mt-6"><Button label={t('auth.retryRestore')} onPress={() => void restoreSession()} /></View>
    <View className="mt-3"><Button label={t('auth.loginAgain')} tone="secondary" onPress={() => void abandonSession()} /></View>
  </View></SafeScreen>

  if (step === 'code' && challenge) return <EmailCodeScreen
    email={challenge.email} code={code} onCodeChange={(value) => { setCode(value); setError('') }}
    onBack={() => { setStep(pendingLink ? 'link' : 'entry'); setCode(''); setError('') }}
    onVerify={() => void verify()} onResend={() => void startEmail()}
    onPassword={() => { setStep('password'); setCode(''); setError('') }}
    retrySeconds={Math.max(0, Math.ceil((challenge.retryAt - now) / 1000))}
    expiresSeconds={Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000))}
    busy={busy} error={error} linking={Boolean(pendingLink)}
  />

  if (step === 'link') return <LinkAccountScreen email={normalizedEmail} busy={busy} error={error}
    onBack={() => { setPendingLink(null); setLinkAuth(null); setStep('entry'); setError('') }}
    onContinue={() => void startEmail()} />

  if (step === 'password') return <PasswordLoginScreen
    email={normalizedEmail} password={password} onPasswordChange={(value) => { setPassword(value); setError('') }}
    onBack={() => { setStep(pendingLink ? 'link' : 'entry'); setPassword(''); setError('') }}
    onSubmit={() => void loginWithPassword()}
    onEmailCode={() => { setPassword(''); setError(''); if (challenge && challenge.email === normalizedEmail && challenge.expiresAt > Date.now()) setStep('code'); else void startEmail() }}
    busy={busy} error={error}
  />

  return <AuthEntryScreen email={email} onEmailChange={(value) => { setEmail(value); setChallenge(null); setError('') }}
    onContinue={() => void startEmail()}
    onPassword={() => { if (validEmail()) { setStep('password'); setError('') } }}
    onSocial={(provider) => void startSocial(provider)} providers={social.providers}
    busy={busy} emailBusy={startMutation.isPending} error={error}
  />
}
