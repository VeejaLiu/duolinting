import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Platform, Pressable, Text, View } from 'react-native'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { useLanguage } from '@/i18n/LanguageProvider'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center border-b-2 border-[#e4eef8] py-4 last:border-b-0">
      <Text className="flex-1 text-base font-black text-text-primary">{label}</Text>
      <Text className="ml-4 text-right text-base font-bold text-text-secondary">{value}</Text>
    </View>
  )
}

/** 关于页展示当前二进制的版本信息，并在 Expo Go / Web 中提供配置回退值。 */
export function AboutScreen() {
  const router = useRouter()
  const { t } = useLanguage()

  // Native values come from the installed binary; config values keep the page useful
  // while developing in Expo Go or viewing the exported web app.
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.1.0'
  const configuredBuild =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Platform.OS === 'android'
        ? Constants.expoConfig?.android?.versionCode
        : undefined
  const build = Application.nativeBuildVersion ?? (configuredBuild ? String(configuredBuild) : null)

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <View className="flex-row items-center border-b-2 border-[#d7e4ef] bg-white px-4 py-3">
          <Pressable
            accessibilityLabel={t('about.backToSettings')}
            className="h-10 w-10 items-center justify-center rounded-[14px] border-2 border-[#d7e2ee] bg-white"
            hitSlop={8}
            onPress={() => {
              // A direct web deep link has no history entry, so return to settings explicitly.
              if (router.canGoBack()) {
                router.back()
              } else {
                router.replace('/settings')
              }
            }}
          >
            <FontAwesome6 color="#172033" name="chevron-left" size={16} />
          </Pressable>
          <Text className="ml-3 text-2xl font-black text-text-primary">{t('about.title')}</Text>
        </View>

        <AppScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 18 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="overflow-hidden rounded-[24px] border-2 border-brand border-b-[6px] border-b-brand-strong bg-brand px-5 py-6">
            <View className="absolute right-[-28] top-[-38] h-36 w-36 rounded-full bg-white/15" />
            <View className="h-14 w-14 items-center justify-center rounded-[18px] border-2 border-white/30 bg-white/20">
              <FontAwesome6 color="#ffffff" name="headphones" size={25} />
            </View>
            <Text className="mt-4 text-2xl font-black text-white">{t('about.appName')}</Text>
            <Text className="mt-1 text-sm font-bold leading-5 text-white/90">{t('about.description')}</Text>
          </View>

          <View>
            <Text className="px-1 text-xs font-black text-text-secondary">{t('settings.aboutSection')}</Text>
            <View className="mt-2 rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-5">
              <InfoRow label={t('about.version')} value={`v${version}`} />
              <InfoRow label={t('about.build')} value={build ?? t('about.unavailable')} />
              <InfoRow label={t('about.license')} value={t('about.licenseValue')} />
            </View>
          </View>

          <View className="rounded-[18px] border-2 border-[#e4eef8] bg-[#edf7ff] px-4 py-3">
            <View className="flex-row items-start">
              <FontAwesome6 color="#1cb0f6" name="code-branch" size={16} />
              <Text className="ml-2 flex-1 text-sm font-bold leading-5 text-text-secondary">
                {t('about.openSource')}
              </Text>
            </View>
          </View>
        </AppScrollView>
      </View>
    </SafeScreen>
  )
}
