import type { AuthMethods, ReauthPurpose } from '@duolinting/domain'
import { useEffect, useState } from 'react'
import { AppState, Pressable, Text, TextInput, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { apiClient } from '@/lib/apiClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'
import { useAuthFlow } from '@/features/auth/useAuthFlow'
import { SocialLoginButtons } from '@/features/auth/components/SocialLoginButtons'

export function ReauthForm({ purpose, onTicket }: { purpose: ReauthPurpose; onTicket: (ticket: string) => void }) {
  const { t, uiLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  const social = useAuthFlow()
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
    }).catch(() => { if (active) setError(t('settings.passwordNetworkFailed')) })
    const timer = setInterval(() => setNow(Date.now()), 1000)
    const subscription = AppState.addEventListener('change', () => setNow(Date.now()))
    return () => { active = false; clearInterval(timer); subscription.remove() }
  }, [authToken])

  const requestCode = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await apiClient.startReauthEmail(purpose, uiLocale, authToken)
      if (!result.challengeId) throw new Error('Missing challenge ID')
      setChallengeId(result.challengeId)
      setRetryAt(Date.parse(result.retryAt))
      setExpiresAt(Date.parse(result.expiresAt))
      setNow(Date.now())
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
    } catch { setError(t(method === 'password' ? 'settings.passwordIncorrect' : 'auth.codeIncorrect')) }
    finally { setBusy(false) }
  }

  if (!methods) return <Text className="text-sm text-text-secondary">{error || t('account.restoring')}</Text>
  const expiresSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return <View className="gap-3">
    <Text className="text-base font-bold text-text-primary">{t('settings.securitySection')}</Text>
    {methods.password ? <Pressable className="min-h-[40px] justify-center" onPress={() => { setMethod('password'); setError('') }}><Text className={`font-bold ${method === 'password' ? 'text-[#1688bd]' : 'text-text-secondary'}`}>{t('authFlow.passwordWay')}</Text></Pressable> : null}
    {methods.email ? <Pressable className="min-h-[40px] justify-center" onPress={() => { setMethod('email_code'); setError('') }}><Text className={`font-bold ${method === 'email_code' ? 'text-[#1688bd]' : 'text-text-secondary'}`}>{t('auth.verificationCode')}</Text></Pressable> : null}
    {method === 'password' && methods.password ? <TextInput accessibilityLabel={t('auth.password')} autoCapitalize="none" autoComplete="current-password" secureTextEntry editable={!busy} className="min-h-[52px] rounded-[16px] border border-[#d7e2ee] bg-white px-4 text-base text-text-primary" placeholder={t('password.placeholder')} placeholderTextColor="#8191a6" value={password} onChangeText={setPassword} /> : null}
    {method === 'email_code' && methods.email ? <>
      <View><Button disabled={busy || retryAt > now} label={retryAt > now ? t('auth.resendIn', { seconds: Math.ceil((retryAt - now) / 1000) }) : t('auth.sendCode')} tone="secondary" onPress={() => void requestCode()} /></View>
      {challengeId ? <TextInput accessibilityLabel={t('auth.verificationCode')} autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} editable={!busy} className="min-h-[52px] rounded-[16px] border border-[#d7e2ee] bg-white px-4 text-center text-xl font-black tracking-[5px] text-text-primary" placeholder="000000" placeholderTextColor="#8191a6" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} /> : null}
      {challengeId ? <Text className="text-xs font-bold text-text-secondary">{expiresSeconds > 0 ? t('auth.codeExpiresIn', { minutes: String(Math.floor(expiresSeconds / 60)).padStart(2, '0'), seconds: String(expiresSeconds % 60).padStart(2, '0') }) : t('auth.codeExpired')}</Text> : null}
    </> : null}
    <SocialLoginButtons providers={social.providers.filter((provider) => methods[provider])} busy={busy || social.busy} onPress={(provider) => {
      void social.run(provider, 'reauth', purpose).then((result) => {
        if (result?.status === 'reauthenticated') onTicket(result.ticket)
        else if (result) setError(t('authFlow.socialFailed'))
      }).catch(() => setError(t('authFlow.socialFailed')))
    }} />
    {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    {methods.password || methods.email ? <View><Button disabled={busy || (method === 'password' ? !password : code.length !== 6 || !challengeId || expiresAt <= now)} label={t('authFlow.continue')} onPress={() => void confirm()} /></View> : null}
  </View>
}
