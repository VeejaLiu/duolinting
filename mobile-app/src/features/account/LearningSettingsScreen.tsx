import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useToast } from '@/providers/ToastProvider'
import { reminderController, useReminderStatus } from '@/services/studyReminder'
import { useAccountPreferencesStore } from '@/stores/accountPreferencesStore'
import { useActivityStore, type ReminderTime } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'
import { ReminderTimePicker } from './ReminderTimePicker'
import { SettingsChoiceSheet, SettingsGroup, SettingsRow, SettingsScaffold, SettingsSwitchRow } from './SettingsComponents'

const goalOptions = [5, 10, 20, 50]
const formatTime = (time: ReminderTime) => `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`

export function LearningSettingsScreen() {
  const { t } = useLanguage()
  const { showToast } = useToast()
  const owner = useAuthStore((state) => state.authUser?.id)
  const goal = useAccountPreferencesStore((state) => state.dailyGoal)
  const updateGoal = useAccountPreferencesStore((state) => state.update)
  const syncState = useAccountPreferencesStore((state) => state.syncState)
  const enabled = useActivityStore((state) => state.reminderEnabled)
  const time = useActivityStore((state) => state.reminderTime)
  const setEnabled = useActivityStore((state) => state.setReminderEnabled)
  const setTime = useActivityStore((state) => state.setReminderTime)
  const status = useReminderStatus((state) => state.status)
  const [goalPicker, setGoalPicker] = useState(false)
  const [timePicker, setTimePicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const reminderCopy = { title: t('reminder.title'), body: t('reminder.body') }
  const options = [...goalOptions, ...(goalOptions.includes(goal) ? [] : [goal])].sort((a, b) => a - b)
    .map((value) => ({ value, label: goalOptions.includes(value) ? t('settings.sentences', { count: value }) : t('settings.currentGoal', { count: value }) }))

  const chooseGoal = async (value: number) => {
    try {
      await updateGoal({ dailyGoal: value })
      setGoalPicker(false)
    } catch {
      showToast({ title: t('auth.toastErrorTitle'), message: t('settings.localSaveFailed'), tone: 'error' })
    }
  }
  const toggle = async (next: boolean) => {
    if (!owner || busy) return
    setBusy(true)
    const actual = await reminderController.sync(String(owner), next, time, reminderCopy, next)
    if (actual === (next ? 'enabled' : 'disabled')) {
      try { await setEnabled(next) } catch {
        await reminderController.sync(String(owner), enabled, time, reminderCopy)
        showToast({ title: t('auth.toastErrorTitle'), message: t('settings.localSaveFailed'), tone: 'error' })
      }
    }
    setBusy(false)
  }
  const chooseTime = async (next: ReminderTime) => {
    setTimePicker(false)
    if (!owner || busy) return
    setBusy(true)
    const actual = await reminderController.sync(String(owner), true, next, reminderCopy)
    if (actual === 'enabled') {
      try { await setTime(next) } catch {
        await reminderController.sync(String(owner), enabled, time, reminderCopy)
        showToast({ title: t('auth.toastErrorTitle'), message: t('settings.localSaveFailed'), tone: 'error' })
      }
    }
    setBusy(false)
  }
  const retry = () => {
    if (!owner) return
    if (enabled) void reminderController.sync(String(owner), true, time, reminderCopy)
    else void toggle(true)
  }
  return <SettingsScaffold title={t('settings.learningSettings')} backTo="/settings">
    <SettingsGroup title={t('settings.learningGoalSection')}>
      <SettingsRow label={t('settings.dailyGoal')} value={t('settings.sentences', { count: goal })} onPress={() => setGoalPicker(true)} />
    </SettingsGroup>
    {syncState === 'local' ? <Pressable accessibilityRole="button" onPress={() => void useAccountPreferencesStore.getState().retry()}><Text className="text-sm text-[#c2410c]">{t('settings.savedLocallyRetry')}</Text></Pressable> : null}
    {Platform.OS !== 'web' ? <>
      <SettingsGroup title={t('settings.learningReminderSection')}>
        <SettingsSwitchRow label={t('settings.dailyReminder')} value={enabled && status === 'enabled'} disabled={busy} onChange={(value) => void toggle(value)} />
        {enabled ? <SettingsRow label={t('settings.reminderTime')} value={formatTime(time)} onPress={() => setTimePicker(true)} /> : null}
      </SettingsGroup>
      <Text className="px-1 text-sm leading-5 text-text-secondary">{t('settings.reminderDeviceNote')}</Text>
      {status === 'permission' ? <View className="rounded-[16px] bg-[#fff0eb] p-4">
        <Text className="text-sm text-danger">{t('settings.notificationPermission')}</Text>
        <Pressable accessibilityRole="button" className="mt-2 min-h-[48px] justify-center" onPress={() => void reminderController.openSystemSettings()}><Text className="font-bold text-[#1688bd]">{t('settings.openSystemSettings')}</Text></Pressable>
      </View> : null}
      {status === 'error' ? <Pressable accessibilityRole="button" className="rounded-[16px] bg-[#fff0eb] p-4" onPress={retry}><Text className="text-sm font-bold text-danger">{t('settings.reminderRetry')}</Text></Pressable> : null}
      <ReminderTimePicker visible={timePicker} value={time} onConfirm={(value) => void chooseTime(value)} onCancel={() => setTimePicker(false)} />
    </> : null}
    <SettingsChoiceSheet visible={goalPicker} title={t('settings.dailyGoal')} options={options} selected={goal} onClose={() => setGoalPicker(false)} onSelect={(value) => void chooseGoal(value)} footer={t('settings.goalCountNote')} />
  </SettingsScaffold>
}
