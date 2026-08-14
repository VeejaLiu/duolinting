import { FontAwesome6 } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, View } from 'react-native'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { useLanguage } from '@/i18n/LanguageProvider'

const contributionEmail = process.env.EXPO_PUBLIC_CONTRIBUTION_EMAIL || 'veejaliu@outlook.com'
const wechatId = '15352290342'
const discordId = '924180303487066182'
const qqId = '1209898373'

export default function ContributeScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const entranceProgress = useRef(new Animated.Value(0)).current
  const heartProgress = useRef(new Animated.Value(0)).current
  const options = [
    { icon: 'headphones', key: 'material' },
    { icon: 'file-lines', key: 'subtitleItem' },
    { icon: 'link', key: 'lead' },
  ] as const

  useEffect(() => {
    let heartAnimation: Animated.CompositeAnimation | undefined
    let mounted = true

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) {
        entranceProgress.setValue(1)
        return
      }

      Animated.timing(entranceProgress, {
        duration: 360,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start()
      heartAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(heartProgress, { duration: 1400, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver: true }),
          Animated.timing(heartProgress, { duration: 1400, easing: Easing.inOut(Easing.ease), toValue: 0, useNativeDriver: true }),
        ]),
      )
      heartAnimation.start()
    })

    return () => {
      mounted = false
      heartAnimation?.stop()
    }
  }, [entranceProgress, heartProgress])

  const openContact = () => {
    // encodeURIComponent 只编码用户界面文案，确保换行和非拉丁字符能安全进入 mailto URL。
    const mailto = `mailto:${contributionEmail}?subject=${encodeURIComponent(t('contribute.emailSubject'))}&body=${encodeURIComponent(t('contribute.emailBody'))}`
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(mailto, '_blank', 'noopener,noreferrer')
      return
    }
    void Linking.openURL(mailto)
  }

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <AppScrollView contentContainerStyle={{ padding: 16, paddingBottom: 42 }}>
          <Pressable
            accessibilityLabel={t('contribute.back')}
            className="h-11 w-11 items-center justify-center rounded-[14px] border-2 border-b-[4px] border-[#d7e2ee] border-b-[#d7e4ef] bg-white active:translate-y-0.5"
            onPress={() => router.back()}
          >
            <FontAwesome6 color="#172033" name="arrow-left" size={17} />
          </Pressable>

          <Animated.View
            className="items-center px-3 pb-7 pt-8"
            style={{
              opacity: entranceProgress,
              transform: [{ translateY: entranceProgress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            }}
          >
            <View className="h-24 w-24 items-center justify-center rounded-[28px] border-[3px] border-white border-b-[8px] border-b-[#46a302] bg-success">
              <FontAwesome6 color="#ffffff" name="headphones" size={38} />
              <Animated.View
                className="absolute -bottom-2 -right-3 h-10 w-10 items-center justify-center rounded-[14px] border-[3px] border-white bg-[#ff6b8a]"
                style={{
                  transform: [
                    { translateY: heartProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
                    { scale: heartProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                  ],
                }}
              >
                <FontAwesome6 color="#ffffff" name="heart" size={16} />
              </Animated.View>
            </View>
            <Text className="mt-7 text-xs font-black uppercase tracking-widest text-[#2b7a0b]">
              {t('contribute.eyebrow')}
            </Text>
            <Text className="mt-2 text-center text-[30px] font-black leading-9 text-text-primary">
              {t('contribute.title')}
            </Text>
            <Text className="mt-3 text-center text-[15px] font-bold leading-6 text-text-secondary">
              {t('contribute.subtitle')}
            </Text>
          </Animated.View>

          <Text className="px-1 text-lg font-black text-text-primary">{t('contribute.welcome')}</Text>
          <View className="mt-3 overflow-hidden rounded-[22px] border-2 border-b-[5px] border-[#e4eef8] border-b-[#d7e4ef] bg-white px-4">
            {options.map(({ icon, key }, index) => (
              <View className={`flex-row items-center py-4 ${index < options.length - 1 ? 'border-b-2 border-[#e4eef8]' : ''}`} key={key}>
                <View className="h-12 w-12 items-center justify-center rounded-[15px] bg-[#edf7ff]">
                  <FontAwesome6 color="#1cb0f6" name={icon} size={19} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-base font-black text-text-primary">{t(`contribute.${key}.title`)}</Text>
                  <Text className="mt-1 text-sm font-bold leading-5 text-text-secondary">{t(`contribute.${key}.description`)}</Text>
                </View>
              </View>
            ))}
          </View>

          <View className="mt-5 rounded-[22px] border-2 border-[#e4eef8] bg-white px-5 py-5">
            <Text className="text-lg font-black text-text-primary">{t('contribute.prepare')}</Text>
            {(['name', 'reason', 'rights'] as const).map((key) => (
              <View className="mt-3 flex-row items-center" key={key}>
                <FontAwesome6 color="#58cc02" name="check" size={15} />
                <Text className="ml-3 flex-1 text-sm font-extrabold leading-5 text-text-secondary">{t(`contribute.prepare.${key}`)}</Text>
              </View>
            ))}
          </View>

          <Pressable
            className="mt-5 min-h-[58px] flex-row items-center justify-center rounded-[18px] border-2 border-b-[6px] border-[#58cc02] border-b-[#46a302] bg-success px-5 active:translate-y-1 active:border-b-2"
            onPress={openContact}
          >
            <FontAwesome6 color="#ffffff" name="envelope" size={18} />
            <Text className="ml-2 text-base font-black text-white">{t('contribute.contact')}</Text>
          </Pressable>
          <Text className="mt-6 text-center text-base font-black text-text-primary">{t('contribute.otherContacts')}</Text>
          <View className="mt-3 overflow-hidden rounded-[22px] border-2 border-b-[5px] border-[#e4eef8] border-b-[#d7e4ef] bg-white px-4">
            <View className="flex-row items-center border-b-2 border-[#edf2f7] py-4">
              <View className="h-12 w-12 items-center justify-center rounded-[15px] bg-[#07c160]">
                <FontAwesome6 color="#ffffff" name="weixin" size={22} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-black text-text-primary">{t('contribute.wechat')}</Text>
                <Text className="mt-1 font-mono text-sm font-bold text-text-secondary" selectable>{wechatId}</Text>
              </View>
              <FontAwesome6 color="#8191a6" name="copy" size={16} />
            </View>
            <Pressable
              className="flex-row items-center border-b-2 border-[#edf2f7] py-4 active:bg-[#f7fbff]"
              onPress={() => void Linking.openURL(`https://discord.com/users/${discordId}`)}
            >
              <View className="h-12 w-12 items-center justify-center rounded-[15px] bg-[#5865f2]">
                <FontAwesome6 color="#ffffff" name="discord" size={22} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-black text-text-primary">Discord</Text>
                <Text className="mt-1 font-mono text-sm font-bold text-text-secondary" selectable>{discordId}</Text>
              </View>
              <View className="rounded-[12px] bg-[#edf7ff] p-2.5">
                <FontAwesome6 color="#1cb0f6" name="arrow-up-right-from-square" size={14} />
              </View>
            </Pressable>
            <View className="flex-row items-center py-4">
              <View className="h-12 w-12 items-center justify-center rounded-[15px] bg-[#12b7f5]">
                <FontAwesome6 color="#ffffff" name="qq" size={22} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-black text-text-primary">QQ</Text>
                <Text className="mt-1 font-mono text-sm font-bold text-text-secondary" selectable>{qqId}</Text>
              </View>
              <FontAwesome6 color="#8191a6" name="copy" size={16} />
            </View>
          </View>
          <Text className="mt-2 text-center text-xs font-bold text-text-secondary">{t('contribute.copyHint')}</Text>
          <Text className="mx-3 mt-4 text-center text-xs font-bold leading-5 text-text-secondary">{t('contribute.note')}</Text>
        </AppScrollView>
      </View>
    </SafeScreen>
  )
}
