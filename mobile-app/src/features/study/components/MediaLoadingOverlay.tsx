import { ActivityIndicator, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

export function MediaLoadingOverlay() {
  const { t } = useLanguage()

  return (
    <View
      accessibilityLabel={t('common.loading')}
      accessibilityLiveRegion="polite"
      className="absolute inset-0 items-center justify-center bg-black/45"
    >
      <View className="items-center gap-2 rounded-[18px] bg-black/55 px-5 py-4">
        <ActivityIndicator color="#ffffff" size="large" />
        <Text className="text-sm font-black text-white">
          {t('common.loading')}
        </Text>
      </View>
    </View>
  )
}
