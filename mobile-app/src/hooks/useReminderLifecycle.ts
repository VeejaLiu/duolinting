import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'
import { reminderController } from '@/services/studyReminder'
import { useActivityStore } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'

export function useReminderLifecycle() {
  const owner = useAuthStore((state) => state.authUser?.id)
  const hydrated = useActivityStore((state) => state.hydrated)
  const enabled = useActivityStore((state) => state.reminderEnabled)
  const time = useActivityStore((state) => state.reminderTime)
  const { languageReady, t, uiLocale } = useLanguage()
  useEffect(() => {
    if (Platform.OS === 'web' || !owner || !hydrated || !languageReady) return
    const refresh = () => {
      void reminderController.sync(String(owner), enabled, time, {
        title: t('reminder.title'), body: t('reminder.body'),
      })
    }
    refresh()
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => listener.remove()
  }, [owner, hydrated, enabled, time.hour, time.minute, languageReady, uiLocale, t])
}
