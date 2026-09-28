import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { AppState, Text, TextInput, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { apiClient } from '@/lib/apiClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'
import { ReauthForm } from './ReauthForm'
import { SettingsScaffold } from './SettingsComponents'

export function LinkEmailScreen() {
  const router = useRouter()
  const { t, uiLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  const applyAuthenticated = useAuthStore((state) => state.applyAuthenticated)
  const [ticket, setTicket] = useState('')
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const normalizedEmail = email.trim().toLowerCase()

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    const subscription = AppState.addEventListener('change', () => setNow(Date.now()))
    return () => { clearInterval(timer); subscription.remove() }
  }, [])

  const start = async () => {
    if (busy) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError(t('auth.invalidEmail')); return }
    setBusy(true); setError('')
    try {
      const result = await apiClient.startEmailLink({ email: normalizedEmail, uiLocale }, authToken)
      if (!result.challengeId) throw new Error('Missing challenge')
      setChallengeId(result.challengeId); setRetryAt(Date.parse(result.retryAt)); setExpiresAt(Date.parse(result.expiresAt)); setNow(Date.now()); setCode('')
    } catch (failure) {
      const code = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(code === 'EMAIL_SEND_LIMITED' || code === 'RATE_LIMITED' ? 'auth.codeRateLimited' : 'auth.codeSendFailed'))
    }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!ticket || !challengeId || code.length !== 6 || busy) return
    setBusy(true); setError('')
    try {
      await apiClient.confirmEmailLink({ email: normalizedEmail, challengeId, code, reauthTicket: ticket }, authToken)
      const user = await apiClient.getCurrentUser(authToken)
      await applyAuthenticated({ user, token: authToken })
      router.replace('/settings/account')
    } catch (failure) {
      const failureCode = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      if (failureCode === 'REAUTH_REQUIRED') setTicket('')
      setError(t(failureCode === 'EMAIL_ALREADY_REGISTERED' ? 'authFlow.emailCollision' : failureCode === 'REAUTH_REQUIRED' ? 'authFlow.reauthExpired' : 'auth.codeIncorrect'))
    } finally { setBusy(false) }
  }
  const expiresSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return <SettingsScaffold title={t('authFlow.linkEmail')} backTo="/settings/account">
    <Text className="text-sm leading-6 text-text-secondary">{t('authFlow.linkEmailHint')}</Text>
    {ticket ? <View className="gap-3">
      <TextInput accessibilityLabel={t('auth.email')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" className="min-h-[52px] rounded-[16px] border border-[#d7e2ee] bg-white px-4 text-base text-text-primary" placeholder={t('auth.emailPlaceholder')} placeholderTextColor="#8191a6" value={email} onChangeText={(value) => { setEmail(value); setChallengeId(null); setError('') }} />
      <Button disabled={busy || retryAt > now} tone="secondary" label={retryAt > now ? t('auth.resendIn', { seconds: Math.ceil((retryAt - now) / 1000) }) : t('auth.sendCode')} onPress={() => void start()} />
      {challengeId ? <TextInput accessibilityLabel={t('auth.verificationCode')} autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} className="min-h-[52px] rounded-[16px] border border-[#d7e2ee] bg-white px-4 text-center text-xl font-black tracking-[5px] text-text-primary" placeholder="000000" placeholderTextColor="#8191a6" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} /> : null}
      {challengeId ? <Text className="text-xs font-bold text-text-secondary">{expiresSeconds > 0 ? t('auth.codeExpiresIn', { minutes: String(Math.floor(expiresSeconds / 60)).padStart(2, '0'), seconds: String(expiresSeconds % 60).padStart(2, '0') }) : t('auth.codeExpired')}</Text> : null}
      {challengeId ? <Button disabled={busy || code.length !== 6 || expiresAt <= now} label={t('authFlow.linkContinue')} onPress={() => void confirm()} /> : null}
    </View> : <ReauthForm purpose="link_email" onTicket={setTicket} />}
    {error ? <Text className="text-sm text-danger">{error}</Text> : null}
  </SettingsScaffold>
}
