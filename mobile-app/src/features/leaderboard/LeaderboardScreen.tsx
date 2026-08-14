import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { RefreshControl, Text, View } from 'react-native'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { Button } from '@/components/foundation/Button'
import { apiClient } from '@/lib/apiClient'
import { useAuthStore } from '@/stores/authStore'
import { LeaderboardRow } from './LeaderboardRow'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 整页排行榜（排行 tab）：
 * - 榜单按"当前掌握句数"排名（与后端口径一致，取消掌握会掉分）；
 * - 接口返回 top 50，全部展示；前三名金/银/铜奖杯，当前用户行绿边高亮；
 * - 自己不在 top 50 时，底部固定一行显示"我的名次"；
 * - currentUser 为 null（还没有任何掌握记录）时，底部固定一行引导
 *   "掌握第一句即可上榜"；
 * - 未登录 / 加载中 / 加载失败三态内联展示，支持下拉刷新（refetch）。
 */
export function LeaderboardScreen() {
  const router = useRouter()
  const authToken = useAuthStore((state) => state.authToken)
  const { t } = useLanguage()
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => apiClient.getLeaderboard(authToken),
    // 无 token 时接口必然 401，直接不发起请求
    enabled: Boolean(authToken),
    refetchOnMount: 'always',
  })

  const entries = data?.entries ?? []
  // 自己不在 top 50 且有排名时，底部固定显示"我的名次"行
  const showMyRankRow =
    Boolean(data?.currentUser) &&
    !entries.some((entry) => entry.isCurrentUser)
  // 已登录但还没有任何掌握记录（currentUser 为 null）：底部给上榜引导
  const showJoinHintRow = Boolean(authToken) && data != null && data.currentUser == null

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <View className="px-4 pt-4">
          <View className="overflow-hidden rounded-[26px] bg-[#58cc02] px-5 py-5">
            <View className="absolute right-[-28] top-[-32] h-32 w-32 rounded-full bg-white/20" />
            <View className="absolute bottom-[-42] left-[-24] h-28 w-28 rounded-full bg-white/15" />
            <View className="flex-row items-center">
              <View className="h-16 w-16 items-center justify-center rounded-[22px] border-2 border-white/30 bg-white/20">
                <FontAwesome6 color="#ffffff" name="trophy" size={24} />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-3xl font-black text-white">{t('leaderboard.title')}</Text>
                <Text className="mt-1 text-sm font-black text-white/85">
                  {t('leaderboard.subtitle')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <AppScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 6 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor="#58cc02"
              colors={['#58cc02']}
            />
          }
        >
          {!authToken ? (
            <View className="items-center rounded-[24px] border-2 border-[#e4eef8] border-b-[6px] border-b-[#d7e4ef] bg-white px-5 py-8">
              <FontAwesome6 color="#8191a6" name="lock" size={22} />
              <Text className="mt-2 text-center text-sm font-bold text-text-secondary">
                {t('leaderboard.loginHint')}
              </Text>
              <View className="mt-4 self-stretch">
                <Button
                  label={t('leaderboard.goToLogin')}
                  onPress={() => router.push('/auth/login')}
                />
              </View>
            </View>
          ) : isLoading ? (
            <Text className="mt-8 text-center text-sm font-bold text-text-secondary">
              {t('leaderboard.loading')}
            </Text>
          ) : isError ? (
            <View className="items-center rounded-[24px] border-2 border-[#e4eef8] border-b-[6px] border-b-[#d7e4ef] bg-white px-5 py-8">
              <Text className="text-center text-sm font-bold text-danger">
                {t('leaderboard.loadFailed')}
              </Text>
              <View className="mt-4 self-stretch">
                <Button
                  label={t('common.retry')}
                  tone="secondary"
                  onPress={() => void refetch()}
                />
              </View>
            </View>
          ) : entries.length === 0 ? (
            <View className="items-center rounded-[24px] border-2 border-[#e4eef8] border-b-[6px] border-b-[#d7e4ef] bg-white px-5 py-8">
              <FontAwesome6 color="#8191a6" name="seedling" size={22} />
              <Text className="mt-2 text-center text-sm font-bold text-text-secondary">
                {t('leaderboard.empty')}
              </Text>
            </View>
          ) : (
            entries.map((entry) => (
              <LeaderboardRow key={entry.rank} entry={entry} />
            ))
          )}
        </AppScrollView>

        {showMyRankRow && data?.currentUser ? (
          <View className="px-4 pb-4">
            <View className="flex-row items-center rounded-[16px] border-2 border-[#58cc02] bg-[#ecffe4] px-3 py-2.5">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-success">
                <Text className="text-xs font-black text-white">
                  {data.currentUser.rank}
                </Text>
              </View>
              <Text className="ml-3 flex-1 text-base font-black text-text-primary">
                {t('leaderboard.myRank')}
              </Text>
              <Text className="text-sm font-black text-text-secondary">
                {t('leaderboard.sentences', { count: data.currentUser.masteredLineCount })}
              </Text>
            </View>
          </View>
        ) : null}

        {showJoinHintRow ? (
          <View className="px-4 pb-4">
            <View className="flex-row items-center rounded-[16px] border-2 border-[#e4eef8] bg-white px-3 py-3">
              <FontAwesome6 color="#58cc02" name="seedling" size={14} />
              <Text className="ml-3 flex-1 text-sm font-bold text-text-secondary">
                {t('leaderboard.firstSentence')}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </SafeScreen>
  )
}
