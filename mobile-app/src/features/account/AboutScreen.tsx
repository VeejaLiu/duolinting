import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Platform, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'
import { openExternalLink } from '@/lib/openExternalLink'
import { LICENSE_URL, OPEN_SOURCE_URL } from '@/lib/publicLinks'
import { useToast } from '@/providers/ToastProvider'
import { SettingsGroup, SettingsReadOnlyRow, SettingsRow, SettingsScaffold } from './SettingsComponents'

export function AboutScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const { showToast } = useToast()
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? t('about.unavailable')
  const configuredBuild = Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber
    : Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode : undefined
  const build = Application.nativeBuildVersion ?? (configuredBuild ? String(configuredBuild) : t('about.unavailable'))
  const open = async (url: string) => {
    if (!await openExternalLink(url)) showToast({ title: t('auth.toastErrorTitle'), message: t('settings.externalOpenFailed'), tone: 'error' })
  }
  return <SettingsScaffold title={t('settings.about')} backTo="/settings">
    <View className="items-center py-5">
      <View className="h-16 w-16 items-center justify-center rounded-[20px] bg-[#1cb0f6]"><FontAwesome6 color="#fff" name="headphones" size={27} /></View>
      <Text className="mt-3 text-2xl font-black text-text-primary">DuolinTing</Text>
      <Text className="mt-1 text-sm text-text-secondary">{t('about.version')} {version}</Text>
    </View>
    <SettingsGroup>
      <SettingsReadOnlyRow label={t('about.build')} value={build} />
      <SettingsRow label={t('settings.openSourceRepository')} external onPress={() => void open(OPEN_SOURCE_URL)} />
      <SettingsRow label={t('about.license')} external onPress={() => void open(LICENSE_URL)} />
      <SettingsRow label={t('sponsors.title')} onPress={() => router.push('/settings/sponsors')} />
    </SettingsGroup>
  </SettingsScaffold>
}
