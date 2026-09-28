import { Pressable, Text, TextInput, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { useLanguage } from '@/i18n/LanguageProvider'
import { AuthScaffold } from './components/AuthScaffold'
import { SocialLoginButtons } from './components/SocialLoginButtons'
import type { OAuthProvider } from '@duolinting/domain'

export function AuthEntryScreen({ email, onEmailChange, onContinue, onPassword, onSocial, providers, busy, emailBusy, error }: {
  email: string
  onEmailChange: (value: string) => void
  onContinue: () => void
  onPassword: () => void
  onSocial: (provider: OAuthProvider) => void
  providers: OAuthProvider[]
  busy: boolean
  emailBusy: boolean
  error: string
}) {
  const { t } = useLanguage()
  return <AuthScaffold title={t('authFlow.title')} subtitle={t('authFlow.subtitle')}>
    <Text className="mb-2 text-base font-black text-text-primary">{t('auth.email')}</Text>
    <TextInput accessibilityLabel={t('auth.email')} autoCapitalize="none" autoComplete="email" autoCorrect={false} importantForAutofill="yes" keyboardType="email-address" nativeID="auth-email" className="min-h-[52px] rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4 text-base font-bold text-text-primary" placeholder={t('auth.emailPlaceholder')} placeholderTextColor="#8191a6" returnKeyType="go" value={email} onChangeText={onEmailChange} onSubmitEditing={onContinue} />
    {error ? <Text className="mt-2 text-sm font-bold text-danger">{error}</Text> : null}
    <View className="mt-5"><Button disabled={busy} label={emailBusy ? t('auth.sendingCode') : t('authFlow.continue')} onPress={onContinue} /></View>
    <Pressable className="mt-3 min-h-[44px] items-center justify-center" disabled={busy} onPress={onPassword}><Text className="text-sm font-black text-[#1688bd]">{t('authFlow.passwordWay')}</Text></Pressable>
    <SocialLoginButtons providers={providers} busy={busy} onPress={onSocial} />
    <Text className="mt-4 text-center text-xs font-bold leading-5 text-text-secondary">{t('authFlow.emailHint')}</Text>
  </AuthScaffold>
}
