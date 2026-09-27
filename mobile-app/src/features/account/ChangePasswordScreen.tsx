import { ApiClientError } from '@duolinting/api-client'
import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { useChangePasswordMutation } from '@/features/auth/hooks'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useToast } from '@/providers/ToastProvider'
import { useAuthStore } from '@/stores/authStore'
import { SettingsScaffold } from './SettingsComponents'

function PasswordField({ autoComplete, label, value, onChangeText, editable }: {
  autoComplete: TextInputProps['autoComplete']; label: string; value: string; onChangeText: (value: string) => void; editable: boolean
}) {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)
  return <View>
    <Text className="mb-2 text-base font-bold text-text-primary">{label}</Text>
    <View className="min-h-[52px] flex-row items-center rounded-[16px] border border-[#d7e2ee] bg-white px-4">
      <TextInput accessibilityLabel={label} autoCapitalize="none" autoComplete={autoComplete} autoCorrect={false} editable={editable} secureTextEntry={!visible} value={value} onChangeText={onChangeText} placeholder={t('password.placeholder')} placeholderTextColor="#8191a6" className="min-h-[52px] flex-1 text-base text-text-primary" />
      <Pressable accessibilityRole="button" accessibilityLabel={t(visible ? 'password.hide' : 'password.show', { label })} className="h-12 w-12 items-center justify-center" onPress={() => setVisible((current) => !current)}><FontAwesome6 name={visible ? 'eye-slash' : 'eye'} size={17} color="#8191a6" /></Pressable>
    </View>
  </View>
}

export function ChangePasswordScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const { showToast } = useToast()
  const mutation = useChangePasswordMutation()
  const expireSession = useAuthStore((state) => state.expireSession)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmedPassword, setConfirmedPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async () => {
    if (mutation.isPending) return
    if (!currentPassword) { setError(t('password.currentRequired')); return }
    if (newPassword.length < 8) { setError(t('password.newMinLength')); return }
    if (newPassword !== confirmedPassword) { setError(t('password.notMatched')); return }
    setError('')
    try { await mutation.mutateAsync({ currentPassword, newPassword }) } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401) { await expireSession(); return }
      setError(failure instanceof ApiClientError && failure.status === 400
        ? t('settings.passwordIncorrect') : t('settings.passwordNetworkFailed'))
      return
    }
    setCurrentPassword(''); setNewPassword(''); setConfirmedPassword('')
    showToast({ title: t('auth.toastSuccessTitle'), message: t('password.changeSuccess'), tone: 'success' })
    router.replace('/settings/account')
  }
  return <SettingsScaffold title={t('password.title')} backTo="/settings/account">
    <Text className="px-1 text-sm leading-5 text-text-secondary">{t('settings.changePasswordDescription')}</Text>
    <PasswordField autoComplete="current-password" label={t('password.current')} editable={!mutation.isPending} value={currentPassword} onChangeText={setCurrentPassword} />
    <PasswordField autoComplete="new-password" label={t('password.new')} editable={!mutation.isPending} value={newPassword} onChangeText={setNewPassword} />
    <PasswordField autoComplete="new-password" label={t('password.confirmNew')} editable={!mutation.isPending} value={confirmedPassword} onChangeText={setConfirmedPassword} />
    {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    <View><Button disabled={mutation.isPending} label={mutation.isPending ? t('password.changing') : t('password.confirmChange')} onPress={() => void submit()} /></View>
  </SettingsScaffold>
}
