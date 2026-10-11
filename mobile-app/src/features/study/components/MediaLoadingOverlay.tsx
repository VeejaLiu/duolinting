import { ActivityIndicator, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

export function MediaLoadingOverlay() {
  const { t } = useLanguage()

  return (
    <View
      pointerEvents="none"
      accessibilityLabel={t('common.loading')}
      accessibilityLiveRegion="polite"
      className="absolute bottom-3 right-3 max-w-[85%] flex-row items-center gap-2 rounded-pill bg-black/65 px-3 py-2"
    >
      <ActivityIndicator color="#ffffff" size="small" />
      <Text className="flex-shrink text-xs font-bold text-white">
        {t('common.loading')}
      </Text>
    </View>
  )
}
