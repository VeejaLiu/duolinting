import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, Pressable, Switch, Text, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { BottomSheet } from '@/components/foundation/BottomSheet'
import { useLanguage } from '@/i18n/LanguageProvider'
import {
  CONTENT_LOCALES,
  UI_LOCALES,
  contentLocaleLabels,
  uiLocaleLabels,
} from '@/i18n/locale'
import { syncDailyReminder } from '@/services/studyReminder'
import { useActivityStore, type ReminderTime } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'

const DAILY_GOAL_OPTIONS = [5, 10, 20, 50]

const REMINDER_TIME_OPTIONS: Array<ReminderTime & { label: string }> = [
  { hour: 12, minute: 0, label: '12:00' },
  { hour: 19, minute: 0, label: '19:00' },
  { hour: 20, minute: 0, label: '20:00' },
  { hour: 21, minute: 0, label: '21:00' },
]

function OptionPill({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      className={`rounded-pill border-2 border-b-[4px] px-4 py-2 ${
        selected
          ? 'border-brand border-b-brand-strong bg-brand'
          : 'border-[#d7e2ee] border-b-[#d7e4ef] bg-white'
      } ${disabled ? 'opacity-40' : ''}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className={`text-sm font-black ${selected ? 'text-white' : 'text-text-primary'}`}>
        {label}
      </Text>
    </Pressable>
  )
}

function LanguageSettingRow({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress: () => void
}) {
  return (
    <Pressable className="flex-row items-center py-3" onPress={onPress}>
      <View className="h-10 w-10 items-center justify-center rounded-[13px] bg-[#edf7ff]">
        <FontAwesome6 color="#1cb0f6" name="language" size={17} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-black text-text-primary">{label}</Text>
        <Text className="mt-0.5 text-sm font-bold text-text-secondary">{value}</Text>
      </View>
      <FontAwesome6 color="#8191a6" name="chevron-right" size={15} />
    </Pressable>
  )
}

/** 设置页集中处理持久化偏好与账号操作，避免“我的”主页承载操作表单。 */
export function SettingsScreen() {
  const router = useRouter()
  const authUser = useAuthStore((state) => state.authUser)
  const accountStatus = useAuthStore((state) => state.accountStatus)
  const logout = useAuthStore((state) => state.logout)
  const dailyGoal = useActivityStore((state) => state.dailyGoal)
  const setDailyGoal = useActivityStore((state) => state.setDailyGoal)
  const reminderEnabled = useActivityStore((state) => state.reminderEnabled)
  const reminderTime = useActivityStore((state) => state.reminderTime)
  const setReminderEnabled = useActivityStore((state) => state.setReminderEnabled)
  const setReminderTime = useActivityStore((state) => state.setReminderTime)
  const [reminderHint, setReminderHint] = useState<string | null>(null)
  const [languagePicker, setLanguagePicker] = useState<'ui' | 'content' | null>(null)
  const {
    contentLocale,
    setContentLocale,
    setUiLocale,
    t,
    uiLocale,
  } = useLanguage()
  const reminderCopy = {
    title: t('reminder.title'),
    body: t('reminder.body'),
  }

  const handleToggleReminder = async (enabled: boolean) => {
    setReminderEnabled(enabled)
    const ok = await syncDailyReminder(enabled, reminderTime, reminderCopy)
    if (!ok) {
      setReminderEnabled(false)
      setReminderHint(t('settings.notificationPermission'))
      return
    }

    setReminderHint(null)
  }

  const handleSelectReminderTime = (time: ReminderTime) => {
    setReminderTime(time)
    if (reminderEnabled) {
      void syncDailyReminder(true, time, reminderCopy)
    }
  }

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <View className="flex-row items-center border-b-2 border-[#d7e4ef] bg-white px-4 py-3">
          <Pressable
            accessibilityLabel={t('settings.backToAccount')}
            className="h-10 w-10 items-center justify-center rounded-[14px] border-2 border-[#d7e2ee] bg-white"
            hitSlop={8}
            onPress={() => {
              // Web 深链直达 /settings 时没有导航历史，直接 back 会触发
              // 未处理的 GO_BACK 警告；此时回到“我的”Tab 作为稳定兜底。
              if (router.canGoBack()) {
                router.back()
              } else {
                router.replace('/(tabs)/account')
              }
            }}
          >
            <FontAwesome6 color="#172033" name="chevron-left" size={16} />
          </Pressable>
          <Text className="ml-3 text-2xl font-black text-text-primary">{t('settings.title')}</Text>
        </View>

        <AppScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 18 }}
        >
          <View>
            <Text className="px-1 text-xs font-black text-text-secondary">{t('settings.language')}</Text>
            <View className="mt-2 rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-5 py-3">
              <Text className="pb-2 text-sm font-bold text-text-secondary">
                {t('settings.languageDescription')}
              </Text>
              <LanguageSettingRow
                label={t('settings.interfaceLanguage')}
                value={uiLocaleLabels[uiLocale]}
                onPress={() => setLanguagePicker('ui')}
              />
              <View className="border-t-2 border-[#e4eef8]" />
              <LanguageSettingRow
                label={t('settings.contentLanguage')}
                value={contentLocaleLabels[contentLocale]}
                onPress={() => setLanguagePicker('content')}
              />
            </View>
          </View>
          <View>
            <Text className="px-1 text-xs font-black text-text-secondary">{t('settings.learningPreferences')}</Text>
            <View className="mt-2 rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-5 py-5">
              <View className="flex-row items-center">
                <FontAwesome6 color="#1cb0f6" name="bullseye" size={16} />
                <Text className="ml-2 text-lg font-black text-text-primary">{t('settings.dailyGoal')}</Text>
              </View>
              <Text className="mt-2 text-sm font-bold text-text-secondary">
                {t('settings.dailyGoalDescription', { count: dailyGoal })}
              </Text>
              <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
                {DAILY_GOAL_OPTIONS.map((option) => (
                  <OptionPill
                    key={option}
                    label={t('settings.sentences', { count: option })}
                    selected={dailyGoal === option}
                    onPress={() => setDailyGoal(option)}
                  />
                ))}
              </View>
            </View>
          </View>

          {Platform.OS !== 'web' ? (
            <View>
              <Text className="px-1 text-xs font-black text-text-secondary">{t('settings.reminders')}</Text>
              <View className="mt-2 rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-5 py-5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <FontAwesome6 color="#1cb0f6" name="bell" size={16} />
                    <Text className="ml-2 text-lg font-black text-text-primary">{t('settings.dailyReminder')}</Text>
                  </View>
                  <Switch
                    trackColor={{ false: '#d7e2ee', true: '#58cc02' }}
                    thumbColor="#ffffff"
                    value={reminderEnabled}
                    onValueChange={(value) => void handleToggleReminder(value)}
                  />
                </View>
                <Text className="mt-2 text-sm font-bold text-text-secondary">
                  {t('settings.dailyReminderDescription')}
                </Text>
                <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
                  {REMINDER_TIME_OPTIONS.map((option) => (
                    <OptionPill
                      key={option.label}
                      disabled={!reminderEnabled}
                      label={option.label}
                      selected={
                        reminderTime.hour === option.hour &&
                        reminderTime.minute === option.minute
                      }
                      onPress={() =>
                        handleSelectReminderTime({ hour: option.hour, minute: option.minute })
                      }
                    />
                  ))}
                </View>
                {reminderHint ? (
                  <Text className="mt-3 text-sm font-bold text-danger">{reminderHint}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View>
            <Text className="px-1 text-xs font-black text-text-secondary">{t('settings.account')}</Text>
            <View className="mt-2 rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-5 py-5">
              <View className="flex-row items-center">
                <FontAwesome6 color="#1cb0f6" name="user" size={17} />
                <View className="ml-2 flex-1">
                  <Text className="text-lg font-black text-text-primary">
                    {authUser?.displayName ?? t('settings.notLoggedIn')}
                  </Text>
                  <Text className="mt-1 text-sm font-bold text-text-secondary">
                    {authUser?.email ?? t('settings.loginHint')}
                  </Text>
                </View>
              </View>

              {authUser ? (
                <View className="mt-5 border-t-2 border-[#e4eef8] pt-5">
                  <Pressable
                    className="flex-row items-center py-1"
                    onPress={() => router.push('/settings/change-password')}
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-[13px] bg-[#edf7ff]">
                      <FontAwesome6 color="#1cb0f6" name="key" size={16} />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-base font-black text-text-primary">{t('settings.changePassword')}</Text>
                      <Text className="mt-0.5 text-sm font-bold text-text-secondary">
                        {t('settings.changePasswordDescription')}
                      </Text>
                    </View>
                    <FontAwesome6 color="#8191a6" name="chevron-right" size={15} />
                  </Pressable>

                  <View className="mt-5 border-t-2 border-[#e4eef8] pt-5">
                  <Text className="text-base font-black text-text-primary">{t('settings.logoutCurrentAccount')}</Text>
                  <Text className="mt-1 text-sm font-bold text-text-secondary">
                    {t(accountStatus)}
                  </Text>
                  <View className="mt-3">
                    <Button
                      label={t('settings.logout')}
                      tone="secondary"
                      onPress={async () => {
                        // 退出只清除认证会话；学习存档继续保留在本机，
                        // 不把“退出”误解为删除用户的学习数据。
                        await logout()
                        router.back()
                      }}
                    />
                  </View>
                </View>
                </View>
              ) : null}
            </View>
          </View>
        </AppScrollView>
        <BottomSheet
          title={languagePicker === 'ui' ? t('language.chooseInterface') : t('language.chooseContent')}
          visible={languagePicker !== null}
          onClose={() => setLanguagePicker(null)}
        >
          <View className="px-5 pb-2 pt-2">
            {languagePicker === 'ui'
              ? UI_LOCALES.map((locale) => (
                  <Pressable
                    key={locale}
                    className="flex-row items-center border-b border-[#e4eef8] py-4 last:border-b-0"
                    onPress={() => {
                      setUiLocale(locale)
                      setLanguagePicker(null)
                    }}
                  >
                    <Text className="flex-1 text-base font-black text-text-primary">{uiLocaleLabels[locale]}</Text>
                    <FontAwesome6
                      color={uiLocale === locale ? '#58cc02' : '#8191a6'}
                      name={uiLocale === locale ? 'circle-check' : 'circle'}
                      size={18}
                    />
                  </Pressable>
                ))
              : CONTENT_LOCALES.map((locale) => (
                  <Pressable
                    key={locale}
                    className="flex-row items-center border-b border-[#e4eef8] py-4 last:border-b-0"
                    onPress={() => {
                      setContentLocale(locale)
                      setLanguagePicker(null)
                    }}
                  >
                    <Text className="flex-1 text-base font-black text-text-primary">{contentLocaleLabels[locale]}</Text>
                    <FontAwesome6
                      color={contentLocale === locale ? '#58cc02' : '#8191a6'}
                      name={contentLocale === locale ? 'circle-check' : 'circle'}
                      size={18}
                    />
                  </Pressable>
                ))}
          </View>
        </BottomSheet>
      </View>
    </SafeScreen>
  )
}
