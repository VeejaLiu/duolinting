import { ApiClientError } from '@duolinting/api-client'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { useDeleteAccountMutation } from '@/features/auth/hooks'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'
import { SettingsGroup, SettingsReadOnlyRow, SettingsScaffold } from './SettingsComponents'
import { ReauthForm } from './ReauthForm'

export function DeleteAccountScreen() {
  const { t } = useLanguage()
  const email = useAuthStore((state) => state.authUser?.email) ?? ''
  const finishDeletedAccount = useAuthStore((state) => state.finishDeletedAccount)
  const expireSession = useAuthStore((state) => state.expireSession)
  const mutation = useDeleteAccountMutation()
  const [reauthTicket, setReauthTicket] = useState('')
  const [error, setError] = useState('')
  const submit = async () => {
    if (mutation.isPending) return
    if (!reauthTicket) return
    setError('')
    try {
      await mutation.mutateAsync({ reauthTicket })
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401) {
        await expireSession()
        return
      }
      if (failure instanceof ApiClientError && failure.code === 'REAUTH_REQUIRED') {
        setReauthTicket('')
        setError(t('authFlow.reauthExpired'))
        return
      }
      setError(failure instanceof ApiClientError && failure.status === 400
        ? t('settings.passwordIncorrect') : t('settings.deleteNetworkFailed'))
      return
    }
    // The server has committed the deletion. Local cleanup may fail but cannot
    // turn the operation back into a password or request failure.
    setReauthTicket('')
    await finishDeletedAccount()
  }
  return <SettingsScaffold title={t('settings.deleteAccount')} backTo="/settings/account">
    <Text className="rounded-[16px] bg-[#fff0eb] p-4 text-sm leading-6 text-[#9a3412]">{t('settings.deleteScopeWarning')}</Text>
    {email ? <SettingsGroup title={t('settings.accountInformation')}><SettingsReadOnlyRow label={t('settings.loginEmail')} value={email} /></SettingsGroup> : null}
    {reauthTicket ? <View className="gap-3">
      <Text className="text-sm font-bold text-text-primary">{t('settings.deleteScopeWarning')}</Text>
      <Button tone="danger" disabled={mutation.isPending} label={mutation.isPending ? t('settings.deletingAccount') : t('settings.deleteAccountConfirm')} onPress={() => void submit()} />
    </View> : <ReauthForm purpose="delete_account" onTicket={setReauthTicket} />}
    {error ? <Text className="text-sm text-danger">{error}</Text> : null}
  </SettingsScaffold>
}
