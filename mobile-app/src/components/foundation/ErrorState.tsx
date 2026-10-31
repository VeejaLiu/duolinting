import { Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Button } from './Button'

export function ErrorState({ message, onRetry, retrying = false }: {
  message: string
  onRetry?: () => void
  retrying?: boolean
}) {
  const { t } = useLanguage()
  return (
    <View className="rounded-xl border border-danger bg-surface px-4 py-4" accessibilityLiveRegion="polite">
      <Text className="font-semibold text-[#b42332]">{t('common.error')}</Text>
      <Text className="mt-2 text-sm text-text-secondary">{message}</Text>
      {onRetry ? (
        <View className="mt-3">
          <Button
            label={t(retrying ? 'common.loading' : 'common.retry')}
            tone="secondary"
            onPress={onRetry}
            disabled={retrying}
            accessibilityRole="button"
            accessibilityState={{ busy: retrying, disabled: retrying }}
          />
        </View>
      ) : null}
    </View>
  )
}
