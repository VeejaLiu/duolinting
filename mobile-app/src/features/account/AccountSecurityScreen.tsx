import { useRouter } from 'expo-router'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'
import { SettingsGroup, SettingsReadOnlyRow, SettingsRow, SettingsScaffold } from './SettingsComponents'

export function AccountSecurityScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const email = useAuthStore((state) => state.authUser?.email) ?? ''
  return <SettingsScaffold title={t('settings.accountSecurity')} backTo="/settings">
    <SettingsGroup title={t('settings.accountInformation')}><SettingsReadOnlyRow label={t('settings.loginEmail')} value={email} /></SettingsGroup>
    <SettingsGroup title={t('settings.securitySection')}><SettingsRow label={t('settings.changePassword')} onPress={() => router.push('/settings/account/change-password')} /></SettingsGroup>
    <SettingsGroup title={t('settings.accountManagement')}><SettingsRow label={t('settings.deleteAccount')} danger onPress={() => router.push('/settings/account/delete')} /></SettingsGroup>
  </SettingsScaffold>
}
