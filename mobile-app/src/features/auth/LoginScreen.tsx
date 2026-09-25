import { FontAwesome6 } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { Button } from '@/components/foundation/Button'
import { BottomSheet } from '@/components/foundation/BottomSheet'
import {
  useLoginMutation,
  useRegisterMutation,
  useRequestEmailCodeMutation,
  useResetPasswordMutation,
} from './hooks'
import { useNavigationStore } from '@/stores/navigationStore'
import { useLanguage } from '@/i18n/LanguageProvider'
import { UI_LOCALES, uiLocaleFlags, uiLocaleLabels } from '@/i18n/locale'

type AuthMode = 'login' | 'register' | 'forgot'

// 认证页优先展示国际化语言，简体中文固定放在最后，方便新用户快速扫读选择。
const authUiLocales = [...UI_LOCALES.filter((locale) => locale !== 'zh-CN'), 'zh-CN'] as const

export function LoginScreen() {
  const router = useRouter()
  const { width: viewportWidth } = useWindowDimensions()
  const isWideLoginViewport = viewportWidth >= 720
  const isNarrowLoginViewport = viewportWidth < 480
  const [mode, setMode] = useState<AuthMode>('login')
  const [switcherWidth, setSwitcherWidth] = useState(0)
  const modeProgress = useRef(new Animated.Value(0)).current
  const formBodyHeight = useRef(new Animated.Value(0)).current
  const formBodyOpacity = useRef(new Animated.Value(1)).current
  const measuredFormBodyHeight = useRef(0)
  const formTransitionSequence = useRef(0)
  const revealFormAfterModeChange = useRef(false)
  const passwordInputRef = useRef<TextInput | null>(null)
  const loginMutation = useLoginMutation()
  const registerMutation = useRegisterMutation()
  const requestEmailCodeMutation = useRequestEmailCodeMutation()
  const resetPasswordMutation = useResetPasswordMutation()
  const pendingPath = useNavigationStore((state) => state.pendingPath)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationRequired, setVerificationRequired] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false)
  const { setUiLocale, t, uiLocale } = useLanguage()
  const activeMutation = mode === 'login'
    ? loginMutation
    : mode === 'register'
      ? registerMutation
      : resetPasswordMutation
  const submitError = activeMutation.error
    ? mode === 'login'
      ? t('auth.loginFailed')
      : mode === 'register'
        ? t('auth.registerFailed')
        : t('auth.resetFailed')
    : ''
  const visibleError = formError || submitError
  const switcherInnerWidth = Math.max(switcherWidth - 12, 0)
  const switcherThumbWidth = switcherInnerWidth / 2
  // Android 区分新账号用户名与已有账号用户名；其他平台用通用 username。
  // 密码字段同理区分当前密码和新密码，让系统能正确填充或提示保存。
  const usernameAutoComplete =
    mode === 'register' && Platform.OS === 'android' ? 'username-new' : 'username'
  const passwordAutoComplete = mode === 'login' ? 'current-password' : 'new-password'

  useEffect(() => {
    Animated.spring(modeProgress, {
      toValue: mode === 'login' ? 0 : 1,
      damping: 18,
      mass: 0.85,
      stiffness: 180,
      useNativeDriver: false,
    }).start()
  }, [mode, modeProgress])

  useEffect(() => {
    if (!revealFormAfterModeChange.current) return
    revealFormAfterModeChange.current = false
    Animated.timing(formBodyOpacity, {
      toValue: 1,
      duration: 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
  }, [formBodyOpacity, mode])

  const updateFormBodyHeight = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) return

    const previousHeight = measuredFormBodyHeight.current
    if (previousHeight === 0) {
      measuredFormBodyHeight.current = nextHeight
      formBodyHeight.setValue(nextHeight)
      return
    }
    if (Math.abs(nextHeight - previousHeight) < 1) return

    measuredFormBodyHeight.current = nextHeight
    formBodyHeight.stopAnimation()
    Animated.timing(formBodyHeight, {
      toValue: nextHeight,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }

  const selectMode = (nextMode: AuthMode) => {
    const transitionSequence = ++formTransitionSequence.current
    formBodyOpacity.stopAnimation()

    if (nextMode === mode) {
      // If a second tap cancels a transition already fading out, restore the form.
      Animated.timing(formBodyOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: false,
      }).start()
      return
    }

    Animated.timing(formBodyOpacity, {
      toValue: 0,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished || transitionSequence !== formTransitionSequence.current) return

      setFormError('')
      setFormNotice('')
      setVerificationCode('')
      setVerificationRequired(true)
      if (nextMode === 'forgot') setPassword('')
      revealFormAfterModeChange.current = true
      setMode(nextMode)
    })
  }

  const requestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setFormError(t('auth.invalidEmail'))
      return
    }

    setFormError('')
    setFormNotice('')
    try {
      const result = await requestEmailCodeMutation.mutateAsync({
        email: normalizedEmail,
        purpose: mode === 'forgot' ? 'password_reset' : 'register',
        uiLocale,
      })
      setVerificationRequired(result.verificationRequired)
      setFormNotice(
        result.delivery === 'disabled'
          ? t('auth.codeNotRequired')
          : result.delivery === 'cooldown'
            ? t('auth.codeCooldown', { seconds: result.retryAfterSeconds ?? 60 })
            : t('auth.codeSent'),
      )
    } catch {
      setFormError(t('auth.codeSendFailed'))
    }
  }

  // modeProgress: 0 表示登录，1 表示注册或找回密码；中间值驱动标题同步过渡。
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

    if (password.trim().length < 8) {
      setFormError(t('auth.passwordMinSix'))
      return
    }

    if (mode !== 'login' && verificationRequired && !/^\d{6}$/.test(verificationCode)) {
      setFormError(t('auth.codeInvalid'))
      return
    }

    setFormError('')
    setFormNotice('')

    try {
      if (mode === 'login') {
        await loginMutation.mutateAsync({
          email: normalizedEmail,
          password,
        })
      } else if (mode === 'register') {
        const emailName = normalizedEmail.split('@')[0]?.trim() || 'learner'
        const randomSuffix = Math.floor(1000 + Math.random() * 9000)
        await registerMutation.mutateAsync({
          email: normalizedEmail,
          displayName: t('auth.generatedLearnerName', {
            name: emailName,
            suffix: randomSuffix,
          }),
          password,
          ...(verificationRequired ? { verificationCode } : {}),
        })
      } else {
        await resetPasswordMutation.mutateAsync({
          email: normalizedEmail,
          verificationCode,
          newPassword: password,
        })
        setPassword('')
        setVerificationCode('')
        setMode('login')
        setFormNotice(t('auth.passwordResetComplete'))
        return
      }
    } catch {
      return
    }

    const nextPath = pendingPath ?? '/(tabs)'
    router.replace(nextPath as '/(tabs)')
  }

  return (
    <SafeScreen>
      <View className="h-full flex-1 overflow-hidden bg-[#f7fbff]">
        <View className="absolute left-[-82] top-[-76] h-52 w-52 rounded-full bg-[#dbf6c9]" />
        <View className="absolute right-[-76] top-16 h-48 w-48 rounded-full bg-[#d8f1ff]" />
        <View className="absolute bottom-[-64] left-10 h-40 w-40 rounded-full bg-[#fff3c9]" />

        <AppScrollView
          className="flex-1"
          extraHeight={24}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            className={`w-full max-w-[640px] flex-1 self-center px-5 pb-5 ${
              isWideLoginViewport ? 'justify-start pt-8' : 'justify-center pt-4'
            }`}
          >
            <View
              className={`items-center ${
                isNarrowLoginViewport ? 'flex-col gap-3' : 'flex-row justify-between'
              }`}
            >
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
              <Pressable
                accessibilityLabel={t('language.chooseInterface')}
                className={`min-h-[42px] flex-row items-center rounded-[15px] border-2 border-[#cfe7f7] bg-white px-3 active:scale-95 ${
                  isNarrowLoginViewport ? 'self-end' : ''
                }`}
                hitSlop={8}
                onPress={() => setLanguagePickerVisible(true)}
              >
                <FontAwesome6 color="#1cb0f6" name="language" size={16} />
                <Text className="ml-2 text-base">{uiLocaleFlags[uiLocale]}</Text>
                <Text className="ml-2 text-sm font-black text-text-primary">
                  {uiLocaleLabels[uiLocale]}
                </Text>
                <FontAwesome6 color="#8191a6" name="chevron-down" size={11} style={{ marginLeft: 8 }} />
              </Pressable>
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
                    <Text className="text-3xl font-black leading-9 text-white">
                      {mode === 'forgot' ? t('auth.resetPassword') : t('auth.createAccount')}
                    </Text>
                  </Animated.View>
                </View>
              </View>

              <Animated.View
                style={{
                  height: formBodyHeight,
                  overflow: 'hidden',
                }}
              >
              <View className="px-5 pb-5 pt-4" onLayout={updateFormBodyHeight}>
                {mode === 'forgot' ? (
                  <Pressable
                    className="min-h-[44px] flex-row items-center self-start rounded-[14px] px-2 active:scale-95"
                    onPress={() => selectMode('login')}
                  >
                    <FontAwesome6 color="#1cb0f6" name="arrow-left" size={15} />
                    <Text className="ml-2 text-sm font-black text-[#1688bd]">{t('auth.backToLogin')}</Text>
                  </Pressable>
                ) : (
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
                )}

                <Animated.View style={{ opacity: formBodyOpacity }}>
                <View className="mt-4">
                  <Text className="mb-2 text-base font-black text-text-primary">
                    {t('auth.email')}
                  </Text>
                  <TextInput
                    key={`auth-${mode}-username`}
                    accessibilityLabel={t('auth.email')}
                    autoCapitalize="none"
                    autoComplete={usernameAutoComplete}
                    autoCorrect={false}
                    className="min-h-[50px] rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4 text-base font-bold text-text-primary"
                    importantForAutofill="yes"
                    keyboardType="email-address"
                    nativeID={`auth-${mode}-username`}
                    onChangeText={setEmail}
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    placeholder={t('auth.emailPlaceholder')}
                    placeholderTextColor="#8191a6"
                    returnKeyType="next"
                    value={email}
                  />
                </View>

                {mode !== 'login' && verificationRequired ? (
                  <View className="mt-3">
                    <Text className="mb-2 text-base font-black text-text-primary">
                      {t('auth.verificationCode')}
                    </Text>
                    <View
                      className={`gap-2 ${
                        isNarrowLoginViewport
                          ? 'flex-col items-stretch'
                          : 'flex-row items-center'
                      }`}
                    >
                      <TextInput
                        accessibilityLabel={t('auth.verificationCode')}
                        autoComplete="one-time-code"
                        className={`min-h-[50px] rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4 text-base font-black tracking-[4px] text-text-primary ${
                          isNarrowLoginViewport ? 'w-full' : 'min-w-0 flex-1'
                        }`}
                        keyboardType="number-pad"
                        maxLength={6}
                        onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 6))}
                        placeholder={t('auth.codePlaceholder')}
                        placeholderTextColor="#8191a6"
                        value={verificationCode}
                      />
                      <Pressable
                        className={`min-h-[50px] flex-row items-center rounded-[16px] border-2 border-[#cfe7f7] bg-[#edf7ff] px-3 active:border-[#1cb0f6] active:scale-95 ${
                          isNarrowLoginViewport ? 'w-full justify-center' : 'shrink-0'
                        }`}
                        disabled={requestEmailCodeMutation.isPending}
                        onPress={() => void requestCode()}
                      >
                        <FontAwesome6 color="#1cb0f6" name="envelope" size={14} />
                        <Text className="ml-2 text-sm font-black text-[#1688bd]">
                          {requestEmailCodeMutation.isPending ? t('auth.sendingCode') : t('auth.sendCode')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <View className="mt-3">
                  <Text className="mb-2 text-base font-black text-text-primary">
                    {mode === 'forgot' ? t('auth.newPassword') : t('auth.password')}
                  </Text>
                  <View className="min-h-[50px] flex-row items-center rounded-[18px] border-2 border-[#d7e2ee] bg-[#f9fcff] px-4">
                    <TextInput
                      key={`auth-${mode}-password`}
                      ref={passwordInputRef}
                      accessibilityLabel={t('auth.password')}
                      autoCapitalize="none"
                      autoComplete={passwordAutoComplete}
                      autoCorrect={false}
                      className="min-h-[50px] flex-1 pr-3 text-base font-bold text-text-primary"
                      importantForAutofill="yes"
                      nativeID={`auth-${mode}-password`}
                      onChangeText={setPassword}
                      onSubmitEditing={() => void submit()}
                      placeholder={t('auth.passwordPlaceholder')}
                      placeholderTextColor="#8191a6"
                      returnKeyType="done"
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

                {mode === 'login' ? (
                  <Pressable className="mt-2 min-h-[34px] justify-center self-end px-1" onPress={() => selectMode('forgot')}>
                    <Text className="text-sm font-black text-[#1688bd]">{t('auth.forgotPassword')}</Text>
                  </Pressable>
                ) : null}

                <View className="mt-4">
                  <Button
                    disabled={activeMutation.isPending || requestEmailCodeMutation.isPending}
                    label={
                      activeMutation.isPending
                        ? mode === 'login'
                          ? t('auth.loggingIn')
                          : mode === 'register'
                            ? t('auth.registering')
                            : t('auth.resettingPassword')
                        : mode === 'login'
                          ? t('auth.startLearning')
                          : mode === 'register'
                            ? t('auth.registerAndStart')
                            : t('auth.resetPassword')
                    }
                    onPress={() => void submit()}
                  />
                </View>

                <View className="mt-3 min-h-[42px] justify-center">
                  {visibleError ? (
                    <View className="rounded-[14px] border-2 border-[#ffb59f] bg-[#fff0eb] px-3 py-2">
                      <Text className="text-sm font-black text-[#c2410c]">
                        {visibleError}
                      </Text>
                    </View>
                  ) : formNotice ? (
                    <View className="rounded-[14px] border-2 border-[#bfe5ff] bg-[#edf8ff] px-3 py-2">
                      <Text className="text-sm font-black text-[#1688bd]">{formNotice}</Text>
                    </View>
                  ) : null}
                </View>
                </Animated.View>
              </View>
              </Animated.View>
            </View>
          </View>
        </AppScrollView>
        <BottomSheet
          title={t('language.chooseInterface')}
          visible={languagePickerVisible}
          onClose={() => setLanguagePickerVisible(false)}
        >
          <View className="px-5 pb-2 pt-2">
            {authUiLocales.map((locale) => (
              <Pressable
                key={locale}
                className="flex-row items-center border-b border-[#e4eef8] py-4 last:border-b-0 active:scale-[0.99]"
                onPress={() => {
                  setUiLocale(locale)
                  setLanguagePickerVisible(false)
                }}
              >
                <View className={`h-10 w-10 items-center justify-center rounded-[13px] ${
                  uiLocale === locale ? 'bg-[#e8f9de]' : 'bg-[#edf7ff]'
                }`}>
                  <Text className="text-xl">{uiLocaleFlags[locale]}</Text>
                </View>
                <Text className="ml-3 flex-1 text-base font-black text-text-primary">
                  {uiLocaleLabels[locale]}
                </Text>
                <FontAwesome6
                  color={uiLocale === locale ? '#58cc02' : '#8191a6'}
                  name={uiLocale === locale ? 'circle-check' : 'circle'}
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
