import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { Button } from '@/components/foundation/Button'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { useAuthStore } from '@/stores/authStore'
import { useLanguage } from '@/i18n/LanguageProvider'

// 生词本入口暂时下线：功能与数据保留，恢复时把开关改回 true 即可。
// 「常用功能」区块目前只有生词本一项，隐藏时整个区块一起隐藏。
const SHOW_VOCABULARY = false

type NavigationRowProps = {
  description: string
  icon: 'book-open' | 'hand-holding-heart'
  title: string
  onPress: () => void
}

function NavigationRow({ description, icon, title, onPress }: NavigationRowProps) {
  return (
    <Pressable
      className="flex-row items-center border-b-2 border-[#e4eef8] py-4 last:border-b-0"
      onPress={onPress}
    >
      <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-[#edf7ff]">
        <FontAwesome6 color="#1cb0f6" name={icon} size={18} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-black text-text-primary">{title}</Text>
        <Text className="mt-0.5 text-sm font-bold text-text-secondary">
          {description}
        </Text>
      </View>
      <FontAwesome6 color="#8191a6" name="chevron-right" size={15} />
    </Pressable>
  )
}

/**
 * “我的”Tab 只承载身份信息和常用入口。
 * 每日目标、提醒和退出等会改变偏好的操作集中在独立设置页，
 * 避免个人主页在登录后变成一条很长的表单。
 */
export function AccountScreen() {
  const router = useRouter()
  const authUser = useAuthStore((state) => state.authUser)
  const accountStatus = useAuthStore((state) => state.accountStatus)
  const { t } = useLanguage()

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <AppScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        >
          <View className="flex-row items-center justify-between py-2">
            <Text className="text-3xl font-black text-text-primary">{t('account.title')}</Text>
            <Pressable
              accessibilityLabel={t('account.openSettings')}
              className="h-11 w-11 items-center justify-center rounded-[14px] border-2 border-[#d7e2ee] bg-white"
              hitSlop={8}
              onPress={() => router.push('/settings')}
            >
              <FontAwesome6 color="#172033" name="gear" size={19} />
            </Pressable>
          </View>

          {/* 基础信息卡把身份、登录状态和登录入口放在首屏最显眼的位置。 */}
          <View className="mt-4 overflow-hidden rounded-[24px] border-2 border-[#58cc02] border-b-[6px] border-b-[#46a302] bg-success px-5 py-5">
            <View className="absolute right-[-26] top-[-34] h-32 w-32 rounded-full bg-white/15" />
            <View className="flex-row items-center">
              <View className="h-16 w-16 items-center justify-center rounded-[22px] border-2 border-white/30 bg-white/20">
                <FontAwesome6 color="#ffffff" name={authUser ? 'user' : 'lock'} size={24} />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-xl font-black text-white" numberOfLines={1}>
                  {authUser?.displayName ?? t('account.guest')}
                </Text>
                <Text className="mt-1 text-sm font-bold text-white/85" numberOfLines={1}>
                  {authUser?.email ?? t('account.progressSyncHint')}
                </Text>
              </View>
            </View>

            <View className="mt-5 flex-row items-center justify-between border-t border-white/25 pt-4">
              <Text className="flex-1 text-sm font-bold text-white/90" numberOfLines={1}>
                {t(accountStatus)}
              </Text>
              <View className="ml-3 rounded-pill bg-white/20 px-3 py-1.5">
                <Text className="text-xs font-black text-white">
                  {authUser ? t('account.signedInBadge') : t('account.localModeBadge')}
                </Text>
              </View>
            </View>

            {!authUser ? (
              <View className="mt-5">
                <Button
                  label={t('account.signInOrRegister')}
                  tone="secondary"
                  onPress={() => router.push('/auth/login')}
                />
              </View>
            ) : null}
          </View>

          {SHOW_VOCABULARY ? (
          <View className="mt-7">
            <Text className="px-1 text-xs font-black text-text-secondary">{t('account.commonFeatures')}</Text>
            <View className="mt-2 rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-4">
              <NavigationRow
                description={t('account.vocabularyDescription')}
                icon="book-open"
                title={t('account.vocabulary')}
                onPress={() => router.push('/vocabulary')}
              />
            </View>
          </View>
          ) : null}

          <View className="mt-7">
            <Text className="px-1 text-xs font-black text-text-secondary">
              {t('account.helpAndParticipation')}
            </Text>
            <View className="mt-2 rounded-[20px] border-2 border-[#e4eef8] border-b-[5px] border-b-[#d7e4ef] bg-white px-4">
              <NavigationRow
                description={t('account.contributeDescription')}
                icon="hand-holding-heart"
                title={t('account.contribute')}
                onPress={() => router.push('/contribute')}
              />
            </View>
          </View>
        </AppScrollView>
      </View>
    </SafeScreen>
  )
}
