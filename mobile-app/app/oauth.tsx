import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { Button } from '@/components/foundation/Button'
import { useLanguage } from '@/i18n/LanguageProvider'

// The browser session normally intercepts the deep link and exchanges its
// one-use ticket. If the OS opens the route instead, keep the user in the
// authentication area; never interpret the URL ticket as a business token.
export default function OAuthReturnFallback() {
  const router = useRouter()
  const { t } = useLanguage()
  return <SafeScreen><View className="flex-1 items-center justify-center gap-5 bg-[#f7fbff] px-5">
    <Text className="text-center text-base font-bold text-text-secondary">{t('account.restoring')}</Text>
    <View className="w-full"><Button label={t('authFlow.back')} onPress={() => router.replace('/auth/login')} /></View>
  </View></SafeScreen>
}
