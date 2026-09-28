import { FontAwesome6 } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { BottomSheet } from '@/components/foundation/BottomSheet'
import { useLanguage } from '@/i18n/LanguageProvider'
import { UI_LOCALES, uiLocaleFlags, uiLocaleLabels } from '@/i18n/locale'
import { useToast } from '@/providers/ToastProvider'
import { openExternalLink } from '@/lib/openExternalLink'
import { PRIVACY_POLICY_URL, SUPPORT_URL } from '@/lib/publicLinks'

const authUiLocales = [...UI_LOCALES.filter((locale) => locale !== 'zh-CN'), 'zh-CN'] as const

export function AuthScaffold({ title, subtitle, onBack, children }: {
  title: string
  subtitle?: string
  onBack?: () => void
  children: ReactNode
}) {
  const { setUiLocale, t, uiLocale } = useLanguage()
  const { showToast } = useToast()
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false)

  return <SafeScreen><View className="flex-1 bg-[#f7fbff]">
    <AppScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      <View className="w-full max-w-[640px] flex-1 self-center justify-center px-5 py-6">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center">
            <Image accessibilityLabel="DuolinTing" contentFit="contain" source={require('../../../../assets/duolinting-logo-ear.png')} style={{ width: 46, height: 46 }} />
            <Text className="ml-2 text-xl font-black text-text-primary">duolinting</Text>
          </View>
          <Pressable accessibilityLabel={t('language.chooseInterface')} className="min-h-[42px] flex-row items-center rounded-[15px] border-2 border-[#cfe7f7] bg-white px-3 active:border-[#1cb0f6]" onPress={() => setLanguagePickerVisible(true)}>
            <Text className="text-base">{uiLocaleFlags[uiLocale]}</Text>
            <Text className="ml-2 text-sm font-black text-text-primary">{uiLocaleLabels[uiLocale]}</Text>
            <FontAwesome6 color="#8191a6" name="chevron-down" size={11} style={{ marginLeft: 8 }} />
          </Pressable>
        </View>

        <View className="mt-7 overflow-hidden rounded-[26px] border-2 border-[#e4eef8] bg-white">
          <View className="bg-[#58cc02] px-5 py-6">
            {onBack ? <Pressable className="mb-4 min-h-[36px] flex-row items-center self-start rounded-[10px] px-1" onPress={onBack}>
              <FontAwesome6 color="#ffffff" name="arrow-left" size={14} />
              <Text className="ml-2 text-sm font-black text-white">{t('authFlow.back')}</Text>
            </Pressable> : null}
            <Text className="text-3xl font-black leading-9 text-white">{title}</Text>
            {subtitle ? <Text className="mt-2 text-base font-bold leading-6 text-white">{subtitle}</Text> : null}
          </View>
          <View className="px-5 pb-6 pt-5">{children}</View>
        </View>

        <View className="mt-5 flex-row flex-wrap items-center justify-center gap-4">
          <Pressable accessibilityRole="link" className="min-h-[44px] justify-center px-2" onPress={() => void openExternalLink(PRIVACY_POLICY_URL).then((ok) => { if (!ok) showToast({ title: t('auth.toastErrorTitle'), message: t('settings.privacyOpenFailed'), tone: 'error' }) })}>
            <Text className="text-sm font-bold text-[#1688bd]">{t('settings.privacyPolicy')}</Text>
          </Pressable>
          <Pressable accessibilityRole="link" className="min-h-[44px] justify-center px-2" onPress={() => void openExternalLink(SUPPORT_URL).then((ok) => { if (!ok) showToast({ title: t('auth.toastErrorTitle'), message: t('settings.supportOpenFailed'), tone: 'error' }) })}>
            <Text className="text-sm font-bold text-[#1688bd]">{t('settings.helpFeedback')}</Text>
          </Pressable>
        </View>
      </View>
    </AppScrollView>
    <BottomSheet title={t('language.chooseInterface')} visible={languagePickerVisible} onClose={() => setLanguagePickerVisible(false)}>
      <View className="px-5 pb-2 pt-2">{authUiLocales.map((locale) =>
        <Pressable key={locale} className="min-h-[52px] flex-row items-center border-b border-[#e4eef8] py-3" onPress={() => {
          void setUiLocale(locale).catch(() => showToast({ title: t('auth.toastErrorTitle'), message: t('settings.localSaveFailed'), tone: 'error' }))
          setLanguagePickerVisible(false)
        }}>
          <Text className="text-xl">{uiLocaleFlags[locale]}</Text>
          <Text className="ml-3 flex-1 text-base font-black text-text-primary">{uiLocaleLabels[locale]}</Text>
        </Pressable>)}</View>
    </BottomSheet>
  </View></SafeScreen>
}
