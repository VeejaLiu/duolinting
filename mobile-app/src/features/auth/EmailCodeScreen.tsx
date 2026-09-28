import { Pressable, Text, TextInput, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { useLanguage } from '@/i18n/LanguageProvider'
import { AuthScaffold } from './components/AuthScaffold'

export function EmailCodeScreen({ email, code, onCodeChange, onBack, onVerify, onResend, onPassword, retrySeconds, expiresSeconds, busy, error, linking = false }: {
  email: string
  code: string
  onCodeChange: (code: string) => void
  onBack: () => void
  onVerify: () => void
  onResend: () => void
  onPassword: () => void
  retrySeconds: number
  expiresSeconds: number
  busy: boolean
  error: string
  linking?: boolean
}) {
  const { t } = useLanguage()
  return <AuthScaffold title={t(linking ? 'authFlow.linkTitle' : 'authFlow.checkEmail')} subtitle={t('authFlow.sentTo', { email })} onBack={onBack}>
    <Pressable className="mb-4 min-h-[38px] justify-center self-start" onPress={onBack}><Text className="text-sm font-black text-[#1688bd]">{t('authFlow.changeEmail')}</Text></Pressable>
    <Text className="mb-2 text-base font-black text-text-primary">{t('auth.verificationCode')}</Text>
    <TextInput accessibilityLabel={t('auth.verificationCode')} autoComplete="one-time-code" importantForAutofill="yes" keyboardType="number-pad" maxLength={6} nativeID="auth-email-code" className="min-h-[58px] rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4 text-center text-2xl font-black tracking-[8px] text-text-primary" placeholder="000000" placeholderTextColor="#8191a6" value={code} onChangeText={(value) => onCodeChange(value.replace(/\D/g, '').slice(0, 6))} />
    <Text className="mt-2 text-xs font-bold text-text-secondary">{expiresSeconds > 0
      ? t('auth.codeExpiresIn', { minutes: String(Math.floor(expiresSeconds / 60)).padStart(2, '0'), seconds: String(expiresSeconds % 60).padStart(2, '0') })
      : t('auth.codeExpired')}</Text>
    {error ? <Text className="mt-2 text-sm font-bold text-danger">{error}</Text> : null}
    <View className="mt-5"><Button disabled={busy || code.length !== 6 || expiresSeconds === 0} label={busy ? t('auth.verifyingEmail') : t(linking ? 'authFlow.linkContinue' : 'authFlow.verifyContinue')} onPress={onVerify} /></View>
    <Pressable className="mt-3 min-h-[44px] items-center justify-center" disabled={busy || retrySeconds > 0} onPress={onResend}>
      <Text className="text-sm font-black text-[#1688bd]">{retrySeconds > 0 ? t('auth.resendIn', { seconds: retrySeconds }) : t('authFlow.resend')}</Text>
    </Pressable>
    <Pressable className="min-h-[44px] items-center justify-center" disabled={busy} onPress={onPassword}><Text className="text-sm font-black text-[#1688bd]">{t('authFlow.passwordWay')}</Text></Pressable>
  </AuthScaffold>
}
