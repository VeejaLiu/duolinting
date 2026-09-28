import { FontAwesome6 } from '@expo/vector-icons'
import type { OAuthProvider } from '@duolinting/domain'
import { Pressable, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

export function SocialLoginButtons({ providers, busy, onPress }: {
  providers: OAuthProvider[]
  busy: boolean
  onPress: (provider: OAuthProvider) => void
}) {
  const { t } = useLanguage()
  if (!providers.length) return null
  return <View className="mt-3 gap-3">
    <Text className="text-center text-sm font-bold text-text-secondary">{t('authFlow.or')}</Text>
    {providers.map((provider) => <Pressable key={provider} accessibilityRole="button" disabled={busy}
      className={`min-h-[52px] flex-row items-center justify-center rounded-[16px] border-2 px-4 active:border-[#1cb0f6] ${provider === 'apple' ? 'border-black bg-black' : 'border-[#d7e2ee] bg-white'}`}
      onPress={() => onPress(provider)}>
      <FontAwesome6 name={provider} size={20} color={provider === 'apple' ? '#fff' : '#4285f4'} />
      <Text className={`ml-3 text-base font-black ${provider === 'apple' ? 'text-white' : 'text-text-primary'}`}>{t(provider === 'apple' ? 'authFlow.apple' : 'authFlow.google')}</Text>
    </Pressable>)}
  </View>
}
