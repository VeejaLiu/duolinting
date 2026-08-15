import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { useChangePasswordMutation } from '@/features/auth/hooks'
import { useLanguage } from '@/i18n/LanguageProvider'

function PasswordField({
  label,
  value,
  onChangeText,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const { t } = useLanguage()

  return (
    <View className="mt-4">
      <Text className="mb-2 text-base font-black text-text-primary">{label}</Text>
      <View className="min-h-[50px] flex-row items-center rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4">
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          className="min-h-[50px] flex-1 pr-3 text-base font-bold text-text-primary"
          onChangeText={onChangeText}
          placeholder={t('password.placeholder')}
          placeholderTextColor="#8191a6"
          secureTextEntry={!visible}
          value={value}
        />
        <Pressable
          accessibilityLabel={t(visible ? 'password.hide' : 'password.show', { label })}
          className="h-10 w-10 items-center justify-center rounded-[14px]"
          hitSlop={8}
          onPress={() => setVisible((current) => !current)}
        >
          <FontAwesome6
            color="#8191a6"
            name={visible ? 'eye-slash' : 'eye'}
            size={18}
          />
        </Pressable>
      </View>
    </View>
  )
}

/** 修改密码独立成页，避免在设置列表内直接暴露敏感输入字段。 */
export function ChangePasswordScreen() {
  const router = useRouter()
  const changePasswordMutation = useChangePasswordMutation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmedPassword, setConfirmedPassword] = useState('')
  const [formError, setFormError] = useState('')
  const { t } = useLanguage()
  const requestError = changePasswordMutation.error ? t('password.changeFailed') : ''

  const submit = async () => {
    if (!currentPassword) {
      setFormError(t('password.currentRequired'))
      return
    }
    if (newPassword.length < 8) {
      setFormError(t('password.newMinLength'))
      return
    }
    if (newPassword !== confirmedPassword) {
      setFormError(t('password.notMatched'))
      return
    }

    setFormError('')
    try {
      await changePasswordMutation.mutateAsync({ currentPassword, newPassword })
      if (router.canGoBack()) {
        router.back()
      } else {
        router.replace('/settings')
      }
    } catch {
      // 错误文案由 requestError 在表单内显示，保留输入便于用户修正。
    }
  }

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <View className="flex-row items-center border-b-2 border-[#d7e4ef] bg-white px-4 py-3">
          <Pressable
            accessibilityLabel={t('password.backToSettings')}
            className="h-10 w-10 items-center justify-center rounded-[14px] border-2 border-[#d7e2ee] bg-white"
            hitSlop={8}
            onPress={() => {
              // Web 深链直达时没有上一页，显式回到设置页而不是触发 GO_BACK。
              if (router.canGoBack()) {
                router.back()
              } else {
                router.replace('/settings')
              }
            }}
          >
            <FontAwesome6 color="#172033" name="chevron-left" size={16} />
          </Pressable>
          <Text className="ml-3 text-2xl font-black text-text-primary">{t('password.title')}</Text>
        </View>

        <AppScrollView
          className="flex-1"
          extraHeight={24}
          contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-5 py-5">
            <View className="flex-row items-center">
              <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-[#edf7ff]">
                <FontAwesome6 color="#1cb0f6" name="shield-halved" size={18} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-lg font-black text-text-primary">{t('password.protectAccount')}</Text>
                <Text className="mt-0.5 text-sm font-bold text-text-secondary">
                  {t('settings.changePasswordDescription')}
                </Text>
              </View>
            </View>

            <PasswordField
              label={t('password.current')}
              onChangeText={setCurrentPassword}
              value={currentPassword}
            />
            <PasswordField
              label={t('password.new')}
              onChangeText={setNewPassword}
              value={newPassword}
            />
            <PasswordField
              label={t('password.confirmNew')}
              onChangeText={setConfirmedPassword}
              value={confirmedPassword}
            />

            {formError || requestError ? (
              <View className="mt-4 rounded-[14px] border-2 border-[#ffb59f] bg-[#fff0eb] px-3 py-2">
                <Text className="text-sm font-black text-[#c2410c]">
                  {formError || requestError}
                </Text>
              </View>
            ) : null}

            <View className="mt-5">
              <Button
                disabled={changePasswordMutation.isPending}
                label={changePasswordMutation.isPending ? t('password.changing') : t('password.confirmChange')}
                onPress={() => void submit()}
              />
            </View>
          </View>
        </AppScrollView>
      </View>
    </SafeScreen>
  )
}
