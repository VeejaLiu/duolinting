import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Platform, Pressable, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'
import { contentLocaleLabels, uiLocaleLabels } from '@/i18n/locale'
import { openExternalLink } from '@/lib/openExternalLink'
import { SUPPORT_URL } from '@/lib/publicLinks'
import { useReminderStatus } from '@/services/studyReminder'
import { useToast } from '@/providers/ToastProvider'
import { useAccountPreferencesStore } from '@/stores/accountPreferencesStore'
import { useActivityStore } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'
import { useStudyStore } from '@/stores/studyStore'
import { SettingsGroup, SettingsRow, SettingsScaffold } from './SettingsComponents'

export function SettingsScreen() {
  const router = useRouter()
  const { t, uiLocale, contentLocale } = useLanguage()
  const { showToast } = useToast()
  const dailyGoal = useAccountPreferencesStore((state) => state.dailyGoal)
  const pending = useAccountPreferencesStore((state) => state.pending)
  const reminderEnabled = useActivityStore((state) => state.reminderEnabled)
  const reminderStatus = useReminderStatus((state) => state.status)
  const pendingActivityCount = useActivityStore((state) => state.pendingOperations?.length ?? 0)
  const logout = useAuthStore((state) => state.logout)
  const [leaving, setLeaving] = useState(false)
  const unsynced = useStudyStore((state) => state.hydrated && JSON.stringify(state.store) !== state.lastSyncedStoreSnapshot) || Object.keys(pending).length > 0 || pendingActivityCount > 0
  const confirmationBody = `${t('settings.logoutConfirmBody')}${unsynced ? `\n\n${t('settings.logoutPending')}` : ''}`
  const confirmLogout = () => {
    const proceed = async () => {
      if (leaving) return
      setLeaving(true)
      try { await logout() } catch {
        showToast({ title: t('auth.toastErrorTitle'), message: t('settings.logoutFailed'), tone: 'error' })
      } finally { setLeaving(false) }
    }
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${t('settings.logoutConfirmTitle')}\n\n${confirmationBody}`)) void proceed()
    } else {
      Alert.alert(t('settings.logoutConfirmTitle'), confirmationBody, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: () => void proceed() },
      ])
    }
  }
  const support = async () => {
    if (!await openExternalLink(SUPPORT_URL)) {
      showToast({ title: t('auth.toastErrorTitle'), message: t('settings.supportOpenFailed'), tone: 'error' })
    }
  }
  return <SettingsScaffold title={t('settings.title')} backTo="/(tabs)/account">
    <SettingsGroup title={t('settings.preferencesSection')}>
      <SettingsRow label={t('settings.learningSettings')} detail={`${t('settings.dailyGoal')} ${t('settings.sentences', { count: dailyGoal })}${Platform.OS === 'web' ? '' : ` · ${reminderEnabled ? reminderStatus === 'enabled' ? t('settings.reminderOn') : t('settings.reminderNeedsAttention') : t('settings.reminderOff')}`}`} icon="bullseye" onPress={() => router.push('/settings/learning')} />
      <SettingsRow label={t('settings.language')} detail={`${t('settings.interfaceLanguage')}: ${uiLocaleLabels[uiLocale]} · ${t('settings.contentDisplayLanguage')}: ${contentLocaleLabels[contentLocale]}`} icon="language" onPress={() => router.push('/settings/language')} />
    </SettingsGroup>
    <SettingsGroup title={t('settings.account')}>
      <SettingsRow label={t('settings.accountSecurity')} icon="user-shield" onPress={() => router.push('/settings/account')} />
      <SettingsRow label={t('settings.privacySettings')} icon="shield-halved" onPress={() => router.push('/settings/privacy')} />
    </SettingsGroup>
    <SettingsGroup title={t('settings.helpAndAbout')}>
      <SettingsRow label={t('settings.helpFeedback')} icon="circle-question" external onPress={() => void support()} />
      <SettingsRow label={t('settings.about')} icon="circle-info" onPress={() => router.push('/settings/about')} />
    </SettingsGroup>
    <View className="items-center pt-1">
      <Pressable accessibilityRole="button" disabled={leaving} className="min-h-[48px] justify-center px-5" onPress={confirmLogout}>
        <Text className="text-base font-bold text-text-secondary">{t('settings.logout')}</Text>
      </Pressable>
    </View>
  </SettingsScaffold>
}
