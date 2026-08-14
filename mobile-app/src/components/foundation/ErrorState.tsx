import { Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

export function ErrorState({ message }: { message: string }) {
  const { t } = useLanguage()
  return (
    <View className="rounded-xl border border-danger bg-surface px-4 py-4">
      <Text className="font-semibold text-danger">{t('common.error')}</Text>
      <Text className="mt-2 text-sm text-text-secondary">{message}</Text>
    </View>
  )
}
