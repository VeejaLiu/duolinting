import { ApiClientError } from '@duolinting/api-client'
import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { useDeleteAccountMutation } from '@/features/auth/hooks'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'
import { SettingsGroup, SettingsReadOnlyRow, SettingsScaffold } from './SettingsComponents'

export function DeleteAccountScreen() {
  const { t } = useLanguage()
  const email = useAuthStore((state) => state.authUser?.email) ?? ''
  const finishDeletedAccount = useAuthStore((state) => state.finishDeletedAccount)
  const expireSession = useAuthStore((state) => state.expireSession)
  const mutation = useDeleteAccountMutation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async () => {
    if (mutation.isPending) return
    if (!password) { setError(t('settings.deleteAccountPasswordRequired')); return }
    setError('')
    try {
      await mutation.mutateAsync({ currentPassword: password })
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401) {
        await expireSession()
        return
      }
      setError(failure instanceof ApiClientError && failure.status === 400
        ? t('settings.passwordIncorrect') : t('settings.deleteNetworkFailed'))
      return
    }
    // The server has committed the deletion. Local cleanup may fail but cannot
    // turn the operation back into a password or request failure.
    setPassword('')
    await finishDeletedAccount()
  }
  return <SettingsScaffold title={t('settings.deleteAccount')} backTo="/settings/account">
    <Text className="rounded-[16px] bg-[#fff0eb] p-4 text-sm leading-6 text-[#9a3412]">{t('settings.deleteScopeWarning')}</Text>
    <SettingsGroup title={t('settings.accountInformation')}><SettingsReadOnlyRow label={t('settings.loginEmail')} value={email} /></SettingsGroup>
    <View>
      <Text className="mb-2 text-base font-bold text-text-primary">{t('settings.deleteAccountPasswordHint')}</Text>
      <TextInput accessibilityLabel={t('settings.deleteAccountPasswordHint')} autoCapitalize="none" autoComplete="current-password" autoCorrect={false} secureTextEntry className="min-h-[52px] rounded-[16px] border border-[#d7e2ee] bg-white px-4 text-base text-text-primary" placeholder={t('password.placeholder')} placeholderTextColor="#8191a6" editable={!mutation.isPending} value={password} onChangeText={setPassword} />
      {error ? <Text className="mt-3 text-sm text-danger">{error}</Text> : null}
    </View>
    <View className="mt-2"><Button tone="danger" disabled={mutation.isPending} label={mutation.isPending ? t('settings.deletingAccount') : t('settings.deleteAccountConfirm')} onPress={() => void submit()} /></View>
  </SettingsScaffold>
}
