import * as AppleAuthentication from 'expo-apple-authentication'
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
    {providers.map((provider) => provider === 'apple'
      ? <AppleAuthentication.AppleAuthenticationButton
          key="apple"
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={16}
          style={{ width: '100%', height: 52, opacity: busy ? 0.5 : 1 }}
          onPress={() => { if (!busy) onPress('apple') }}
        />
      : <Pressable key="google" accessibilityRole="button" disabled={busy}
          className="min-h-[52px] flex-row items-center justify-center rounded-[16px] border-2 border-[#d7e2ee] bg-white px-4 active:border-[#1cb0f6]"
          onPress={() => onPress('google')}>
          <FontAwesome6 name="google" size={20} color="#4285f4" />
          <Text className="ml-3 text-base font-black text-text-primary">{t('authFlow.google')}</Text>
        </Pressable>)}
  </View>
}
