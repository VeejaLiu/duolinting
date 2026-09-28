import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { apiClient } from '@/lib/apiClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'
import { ReauthForm } from './ReauthForm'
import { SettingsScaffold } from './SettingsComponents'

export function UnlinkIdentityScreen() {
  const router = useRouter()
  const { provider: rawProvider } = useLocalSearchParams<{ provider?: string }>()
  const provider = rawProvider === 'apple' || rawProvider === 'google' ? rawProvider : null
  const { t } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  const expireSession = useAuthStore((state) => state.expireSession)
  const [ticket, setTicket] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const unlink = async () => {
    if (!provider || !ticket || busy) return
    setBusy(true); setError('')
    try {
      const result = await apiClient.unlinkOAuthIdentity(provider, ticket, authToken)
      if (result.currentSessionRevoked) await expireSession()
      else router.replace('/settings/account')
    } catch (failure) {
      const code = typeof failure === 'object' && failure && 'code' in failure ? String(failure.code) : ''
      setError(t(code === 'LAST_LOGIN_METHOD' ? 'authFlow.lastMethod' : code === 'REAUTH_REQUIRED' ? 'authFlow.reauthExpired' : 'authFlow.socialFailed'))
      setTicket('')
    } finally { setBusy(false) }
  }
  return <SettingsScaffold title={t('authFlow.unlinkTitle')} backTo="/settings/account">
    <Text className="text-sm leading-6 text-text-secondary">{t('authFlow.unlinkHint', { provider: provider ?? '' })}</Text>
    {provider ? ticket ? <View className="gap-3">
      <Button tone="danger" disabled={busy} label={t('authFlow.unlinkConfirm')} onPress={() => void unlink()} />
    </View> : <ReauthForm purpose="unlink_identity" onTicket={setTicket} /> : null}
    {error ? <Text className="text-sm text-danger">{error}</Text> : null}
  </SettingsScaffold>
}
