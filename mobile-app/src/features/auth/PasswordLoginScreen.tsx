import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { FontAwesome6 } from '@expo/vector-icons'
import { Button } from '@/components/foundation/Button'
import { useLanguage } from '@/i18n/LanguageProvider'
import { AuthScaffold } from './components/AuthScaffold'

export function PasswordLoginScreen({ email, password, onPasswordChange, onBack, onSubmit, onEmailCode, busy, error }: {
  email: string
  password: string
  onPasswordChange: (password: string) => void
  onBack: () => void
  onSubmit: () => void
  onEmailCode: () => void
  busy: boolean
  error: string
}) {
  const { t } = useLanguage()
  const [showPassword, setShowPassword] = useState(false)
  return <AuthScaffold title={t('authFlow.enterPassword')} onBack={onBack}>
    <Pressable className="mb-5 min-h-[42px] flex-row items-center justify-between rounded-[14px] bg-[#edf7ff] px-3" onPress={onBack}>
      <Text className="flex-1 text-sm font-bold text-text-primary">{email}</Text>
      <Text className="ml-2 text-sm font-black text-[#1688bd]">{t('authFlow.changeEmail')}</Text>
    </Pressable>
    <Text className="mb-2 text-base font-black text-text-primary">{t('auth.password')}</Text>
    <View className="min-h-[52px] flex-row items-center rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4">
      <TextInput accessibilityLabel={t('auth.password')} autoCapitalize="none" autoComplete="current-password" autoCorrect={false} importantForAutofill="yes" nativeID="auth-password" className="min-h-[50px] flex-1 text-base font-bold text-text-primary" placeholder={t('auth.passwordPlaceholder')} placeholderTextColor="#8191a6" secureTextEntry={!showPassword} value={password} onChangeText={onPasswordChange} onSubmitEditing={onSubmit} />
      <Pressable accessibilityRole="button" accessibilityLabel={t(showPassword ? 'password.hide' : 'password.show', { label: t('auth.password') })} className="h-10 w-10 items-center justify-center" onPress={() => setShowPassword((current) => !current)}><FontAwesome6 color="#8191a6" name={showPassword ? 'eye-slash' : 'eye'} size={18} /></Pressable>
    </View>
    {error ? <Text className="mt-2 text-sm font-bold text-danger">{error}</Text> : null}
    <View className="mt-5"><Button disabled={busy} label={busy ? t('auth.loggingIn') : t('auth.login')} onPress={onSubmit} /></View>
    <Pressable className="mt-3 min-h-[44px] items-center justify-center" disabled={busy} onPress={onEmailCode}><Text className="text-sm font-black text-[#1688bd]">{t('authFlow.passwordFallback')}</Text></Pressable>
  </AuthScaffold>
}
