import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { useStudyStore } from '@/stores/studyStore'
import { AchievementsCard } from './AchievementsCard'
import { StudyStatsCard } from './StudyStatsCard'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 成长页（成长 tab）：学习统计 + 成就徽章墙 + 我的生词入口。
 * 数据全部来自本地 store（统计口径见 StudyStatsCard 注释），无需登录。
 */
export function GrowthScreen() {
  const router = useRouter()
  const store = useStudyStore((state) => state.store)
  const { t } = useLanguage()

  // 生词总数：跨章节汇总（每章节 vocabulary 是 Record<word, context>，
  // key 天然去重，直接累加各章节的 key 数即可）
  const totalWordCount = Object.values(store.progressByExercise).reduce(
    (total, progress) =>
      total + Object.keys(progress.vocabulary ?? {}).length,
    0,
  )

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <AppScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 14 }}
        >
          <View className="overflow-hidden rounded-[26px] bg-[#58cc02] px-5 py-5">
            <View className="absolute right-[-28] top-[-32] h-32 w-32 rounded-full bg-white/20" />
            <View className="absolute bottom-[-42] left-[-24] h-28 w-28 rounded-full bg-white/15" />
            <View className="flex-row items-center">
              <View className="h-16 w-16 items-center justify-center rounded-[22px] border-2 border-white/30 bg-white/20">
                <FontAwesome6 color="#ffffff" name="chart-line" size={24} />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-3xl font-black text-white">{t('growth.title')}</Text>
                <Text className="mt-1 text-sm font-black text-white/85">
                  {t('growth.subtitle')}
                </Text>
              </View>
            </View>
          </View>

          <StudyStatsCard />

          <AchievementsCard />

          {/* 生词本入口卡 */}
          <Pressable
            className="flex-row items-center rounded-[24px] border-2 border-[#e4eef8] border-b-[6px] border-b-[#d7e4ef] bg-white px-5 py-5"
            onPress={() => router.push('/vocabulary')}
          >
            <View className="h-12 w-12 items-center justify-center rounded-[16px] bg-[#ecffe4]">
              <FontAwesome6 color="#58cc02" name="bookmark" size={18} />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-lg font-black text-text-primary">
                {t('growth.vocabulary')}
              </Text>
              <Text className="mt-0.5 text-sm font-bold text-text-secondary">
                {totalWordCount > 0
                  ? t('growth.vocabularyCollected', { count: totalWordCount })
                  : t('growth.vocabularyHint')}
              </Text>
            </View>
            <FontAwesome6 color="#8191a6" name="chevron-right" size={14} />
          </Pressable>
        </AppScrollView>
      </View>
    </SafeScreen>
  )
}
