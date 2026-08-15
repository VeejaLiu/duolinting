import { FontAwesome6 } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { Button } from '@/components/foundation/Button'
import { useLoginMutation, useRegisterMutation } from './hooks'
import { useNavigationStore } from '@/stores/navigationStore'
import { useLanguage } from '@/i18n/LanguageProvider'

type AuthMode = 'login' | 'register'

export function LoginScreen() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('login')
  const [switcherWidth, setSwitcherWidth] = useState(0)
  const modeProgress = useRef(new Animated.Value(0)).current
  const loginMutation = useLoginMutation()
  const registerMutation = useRegisterMutation()
  const pendingPath = useNavigationStore((state) => state.pendingPath)
  const setPendingPath = useNavigationStore((state) => state.setPendingPath)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const { t } = useLanguage()
  const activeMutation = mode === 'login' ? loginMutation : registerMutation
  const submitError = activeMutation.error
    ? mode === 'login'
      ? t('auth.loginFailed')
      : t('auth.registerFailed')
    : ''
  const visibleError = formError || submitError
  const switcherInnerWidth = Math.max(switcherWidth - 12, 0)
  const switcherThumbWidth = switcherInnerWidth / 2

  useEffect(() => {
    Animated.spring(modeProgress, {
      toValue: mode === 'login' ? 0 : 1,
      damping: 18,
      mass: 0.85,
      stiffness: 180,
      useNativeDriver: false,
    }).start()
  }, [mode, modeProgress])

  const selectMode = (nextMode: AuthMode) => {
    if (nextMode === mode) {
      return
    }

    setFormError('')
    setMode(nextMode)
  }

  // modeProgress: 0 表示登录，1 表示注册；中间值驱动标题和滑块同步过渡。
  const switcherThumbStyle = {
    width: switcherThumbWidth,
    height: 44,
    position: 'absolute' as const,
    left: 6,
    top: 6,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    transform: [
      {
        translateX: modeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, switcherThumbWidth],
        }),
      },
    ],
  }
  const loginTitleStyle = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    opacity: modeProgress.interpolate({
      inputRange: [0, 0.45, 1],
      outputRange: [1, 0, 0],
    }),
    transform: [
      {
        translateY: modeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -10],
        }),
      },
    ],
  }
  const registerTitleStyle = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    opacity: modeProgress.interpolate({
      inputRange: [0, 0.55, 1],
      outputRange: [0, 0, 1],
    }),
    transform: [
      {
        translateY: modeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  }
  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setFormError(t('auth.invalidEmail'))
      return
    }

    if (password.trim().length < 6) {
      setFormError(t('auth.passwordMinSix'))
      return
    }

    setFormError('')

    try {
      if (mode === 'login') {
        await loginMutation.mutateAsync({
          email: normalizedEmail,
          password,
        })
      } else {
        const emailName = normalizedEmail.split('@')[0]?.trim() || 'learner'
        const randomSuffix = Math.floor(1000 + Math.random() * 9000)
        await registerMutation.mutateAsync({
          email: normalizedEmail,
          displayName: t('auth.generatedLearnerName', {
            name: emailName,
            suffix: randomSuffix,
          }),
          password,
        })
      }
    } catch {
      return
    }

    const nextPath = pendingPath ?? '/(tabs)'
    setPendingPath(null)
    router.replace(nextPath as '/(tabs)')
  }

  return (
    <SafeScreen>
      <View className="h-full flex-1 overflow-hidden bg-[#f7fbff]">
        <View className="absolute left-[-82] top-[-76] h-52 w-52 rounded-full bg-[#dbf6c9]" />
        <View className="absolute right-[-76] top-16 h-48 w-48 rounded-full bg-[#d8f1ff]" />
        <View className="absolute bottom-[-64] left-10 h-40 w-40 rounded-full bg-[#fff3c9]" />

        {/*
         * 键盘弹出后，iOS 用 padding 腾出键盘高度，Android 缩小可用视区；
         * 内层 ScrollView 处理小屏或横屏时表单高度超过剩余视区的情况，
         * 避免邮箱、密码输入框被键盘遮挡。
         */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-1 justify-center px-5 pb-5 pt-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Image
                    accessibilityLabel="DuolinTing"
                    contentFit="contain"
                    source={require('../../../assets/duolinting-logo-ear.png')}
                    style={{ height: 52, width: 52 }}
                  />
                  <View className="ml-3">
                    <Text className="text-2xl font-black text-text-primary">duolinting</Text>
                  </View>
                </View>
              </View>

              <View className="mt-5 overflow-hidden rounded-[26px] border-2 border-[#e4eef8] bg-white">
                <View className="bg-[#58cc02] px-6 pb-5 pt-5">
                  <View className="absolute right-[-20] top-[-28] h-28 w-28 rounded-full bg-white/20" />
                  <View className="absolute bottom-[-34] left-[-18] h-24 w-24 rounded-full bg-white/15" />
                  <View className="h-[40px] overflow-hidden">
                    <Animated.View style={loginTitleStyle}>
                      <Text className="text-3xl font-black leading-9 text-white">{t('auth.welcomeBack')}</Text>
                    </Animated.View>
                    <Animated.View style={registerTitleStyle}>
                      <Text className="text-3xl font-black leading-9 text-white">{t('auth.createAccount')}</Text>
                    </Animated.View>
                  </View>
                </View>

                <View className="px-5 pb-5 pt-4">
                  <View
                    className="relative flex-row rounded-[18px] border-2 border-[#dcebf7] bg-[#edf7ff] p-1.5"
                    onLayout={(event) => setSwitcherWidth(event.nativeEvent.layout.width)}
                  >
                    {switcherThumbWidth > 0 ? (
                      <Animated.View pointerEvents="none" style={switcherThumbStyle} />
                    ) : null}
                    {(['login', 'register'] as const).map((value) => (
                      <Pressable
                        key={value}
                        className="z-10 min-h-[44px] flex-1 items-center justify-center rounded-[13px] px-4"
                        onPress={() => selectMode(value)}
                      >
                        <Text
                          className={`text-center text-base font-black ${
                            mode === value ? 'text-text-primary' : 'text-text-secondary'
                          }`}
                        >
                          {value === 'login' ? t('auth.login') : t('auth.register')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <View className="mt-4">
                    <Text className="mb-2 text-base font-black text-text-primary">
                      {t('auth.email')}
                    </Text>
                    <TextInput
                      autoCapitalize="none"
                      className="min-h-[50px] rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4 text-base font-bold text-text-primary"
                      keyboardType="email-address"
                      onChangeText={setEmail}
                      placeholder={t('auth.emailPlaceholder')}
                      placeholderTextColor="#8191a6"
                      value={email}
                    />
                  </View>

                  <View className="mt-3">
                    <Text className="mb-2 text-base font-black text-text-primary">
                      {t('auth.password')}
                    </Text>
                    <View className="min-h-[50px] flex-row items-center rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4">
                      <TextInput
                        className="min-h-[50px] flex-1 pr-3 text-base font-bold text-text-primary"
                        onChangeText={setPassword}
                        placeholder={t('auth.passwordPlaceholder')}
                        placeholderTextColor="#8191a6"
                        secureTextEntry={!showPassword}
                        value={password}
                      />
                      <Pressable
                        className="h-10 w-10 items-center justify-center rounded-[14px]"
                        onPress={() => setShowPassword((current) => !current)}
                      >
                        <FontAwesome6
                          color="#8191a6"
                          name={showPassword ? 'eye-slash' : 'eye'}
                          size={18}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View className="mt-4">
                    <Button
                      disabled={activeMutation.isPending}
                      label={
                        activeMutation.isPending
                          ? mode === 'login'
                            ? t('auth.loggingIn')
                            : t('auth.registering')
                          : mode === 'login'
                            ? t('auth.startLearning')
                            : t('auth.registerAndStart')
                      }
                      onPress={() => void submit()}
                    />
                  </View>

                  <View className="mt-3 min-h-[42px] justify-center">
                    {visibleError ? (
                      <View className="rounded-[14px] border-2 border-[#ffb59f] bg-[#fff0eb] px-3 py-2">
                        <Text className="text-sm font-black text-[#c2410c]" numberOfLines={1}>
                          {visibleError}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeScreen>
  )
}
