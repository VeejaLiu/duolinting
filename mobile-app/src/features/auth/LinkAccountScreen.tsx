import { Text, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { useLanguage } from '@/i18n/LanguageProvider'
import { AuthScaffold } from './components/AuthScaffold'

export function LinkAccountScreen({ email, onContinue, onBack, busy, error }: {
  email: string
  onContinue: () => void
  onBack: () => void
  busy: boolean
  error: string
}) {
  const { t } = useLanguage()
  return <AuthScaffold title={t('authFlow.linkTitle')} onBack={onBack}>
    <Text className="text-base font-bold leading-6 text-text-secondary">{t('authFlow.linkHint', { email })}</Text>
    {error ? <Text className="mt-3 text-sm font-bold text-danger">{error}</Text> : null}
    <View className="mt-5"><Button disabled={busy} label={t('authFlow.linkContinue')} onPress={onContinue} /></View>
  </AuthScaffold>
}
