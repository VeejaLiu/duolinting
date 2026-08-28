import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Platform, Pressable, Switch, Text, TextInput, View } from 'react-native'
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
import { useDeleteAccountMutation } from '@/features/auth/hooks'
import { progressStorage } from '@/services/progressStorage'
import { syncDailyReminder } from '@/services/studyReminder'
import { useActivityStore, type ReminderTime } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'
import { useStudyStore } from '@/stores/studyStore'

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
  const queryClient = useQueryClient()
  const deleteAccountMutation = useDeleteAccountMutation()
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
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteAccountError, setDeleteAccountError] = useState('')
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

  const openDeleteAccount = () => {
    if (deleteAccountMutation.isPending) {
      return
    }

    deleteAccountMutation.reset()
    setDeletePassword('')
    setDeleteAccountError('')
    setDeleteAccountVisible(true)
  }

  const closeDeleteAccount = () => {
    setDeleteAccountVisible(false)
    setDeletePassword('')
    setDeleteAccountError('')
  }

  const submitDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteAccountError(t('settings.deleteAccountPasswordRequired'))
      return
    }

    setDeleteAccountError('')
    try {
      await deleteAccountMutation.mutateAsync({ currentPassword: deletePassword })

      // 服务端删除成功后同步清空设备上的账号数据，避免下一个账号在同一
      // 台设备上看到上一账号的进度、活动记录或已缓存的私有查询结果。
      useStudyStore.getState().resetStore()
      useActivityStore.getState().resetForAccountDeletion()
      queryClient.clear()
      await progressStorage.clearLearnerData()
      await logout()

      setDeleteAccountVisible(false)
      router.replace('/(tabs)/account')
    } catch {
      // 保留密码输入，便于用户修正；具体错误统一用本地化文案呈现。
      setDeleteAccountError(t('settings.deleteAccountFailed'))
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
                    <Text className="text-base font-black text-text-primary">
                      {t('settings.logoutCurrentAccount')}
                    </Text>
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

                  <View className="mt-5 border-t-2 border-[#e4eef8] pt-5">
                    <Text className="text-base font-black text-danger">
                      {t('settings.deleteAccount')}
                    </Text>
                    <Text className="mt-1 text-sm font-bold text-text-secondary">
                      {t('settings.deleteAccountDescription')}
                    </Text>
                    <View className="mt-3">
                      <Button
                        disabled={deleteAccountMutation.isPending}
                        label={t('settings.deleteAccount')}
                        tone="danger"
                        onPress={openDeleteAccount}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          <View>
            <Text className="px-1 text-xs font-black text-text-secondary">{t('settings.aboutSection')}</Text>
            <View className="mt-2 rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-5 py-3">
              <Pressable
                className="flex-row items-center py-1"
                onPress={() => router.push('/settings/about')}
              >
                <View className="h-10 w-10 items-center justify-center rounded-[13px] bg-[#edf7ff]">
                  <FontAwesome6 color="#1cb0f6" name="circle-info" size={17} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-base font-black text-text-primary">{t('settings.about')}</Text>
                  <Text className="mt-0.5 text-sm font-bold text-text-secondary">
                    {t('settings.aboutDescription')}
                  </Text>
                </View>
                <FontAwesome6 color="#8191a6" name="chevron-right" size={15} />
              </Pressable>
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
        <BottomSheet
          title={t('settings.deleteAccount')}
          visible={deleteAccountVisible}
          onClose={closeDeleteAccount}
        >
          <View className="px-5 pb-2 pt-2">
            <View className="rounded-[16px] border-2 border-[#ffb59f] bg-[#fff0eb] px-4 py-3">
              <Text className="text-sm font-black leading-5 text-[#c2410c]">
                {t('settings.deleteAccountWarning')}
              </Text>
            </View>
            <Text className="mt-4 text-base font-black text-text-primary">
              {t('settings.deleteAccountPasswordHint')}
            </Text>
            <View className="mt-2 min-h-[50px] flex-row items-center rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4">
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                className="min-h-[50px] flex-1 text-base font-bold text-text-primary"
                editable={!deleteAccountMutation.isPending}
                onChangeText={setDeletePassword}
                placeholder={t('password.placeholder')}
                placeholderTextColor="#8191a6"
                secureTextEntry
                value={deletePassword}
              />
            </View>
            {deleteAccountError ? (
              <View className="mt-3 rounded-[14px] border-2 border-[#ffb59f] bg-[#fff0eb] px-3 py-2">
                <Text className="text-sm font-black text-[#c2410c]">
                  {deleteAccountError}
                </Text>
              </View>
            ) : null}
            <View className="mt-5 flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <Button
                  disabled={deleteAccountMutation.isPending}
                  label={t('common.cancel')}
                  tone="secondary"
                  onPress={closeDeleteAccount}
                />
              </View>
              <View className="flex-1">
                <Button
                  disabled={deleteAccountMutation.isPending}
                  label={
                    deleteAccountMutation.isPending
                      ? t('settings.deletingAccount')
                      : t('settings.deleteAccountConfirm')
                  }
                  tone="danger"
                  onPress={() => void submitDeleteAccount()}
                />
              </View>
            </View>
          </View>
        </BottomSheet>
      </View>
    </SafeScreen>
  )
}
