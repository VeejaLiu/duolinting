import { useLanguage } from '@/i18n/LanguageProvider'
import { openExternalLink } from '@/lib/openExternalLink'
import { PRIVACY_POLICY_URL } from '@/lib/publicLinks'
import { useToast } from '@/providers/ToastProvider'
import { SettingsGroup, SettingsRow, SettingsScaffold } from './SettingsComponents'

export function PrivacySettingsScreen() {
  const { t } = useLanguage()
  const { showToast } = useToast()
  const openPolicy = async () => {
    if (!await openExternalLink(PRIVACY_POLICY_URL)) {
      showToast({ title: t('auth.toastErrorTitle'), message: t('settings.privacyOpenFailed'), tone: 'error' })
    }
  }
  return <SettingsScaffold title={t('settings.privacySettings')} backTo="/settings">
    <SettingsGroup title={t('settings.privacyNotice')}>
      <SettingsRow label={t('settings.privacyPolicy')} external onPress={() => void openPolicy()} />
    </SettingsGroup>
  </SettingsScaffold>
}
