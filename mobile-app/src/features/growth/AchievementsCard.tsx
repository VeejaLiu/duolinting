import { FontAwesome6 } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { computeAchievements } from '@/lib/achievements'
import { calculateStreak } from '@/lib/streak'
import { useActivityStore } from '@/stores/activityStore'
import { useStudyStore } from '@/stores/studyStore'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 成就徽章墙卡片：
 * - 已解锁：多邻国绿底图标 + 标题/描述；
 * - 未解锁：灰色图标 + 锁标，展示解锁条件作为引导；
 * - 一枚都没解锁时整张卡不显示（避免新用户看到一整面灰墙）。
 */
export function AchievementsCard() {
  const store = useStudyStore((state) => state.store)
  const activityDays = useActivityStore((state) => state.days)
  const dailyGoal = useActivityStore((state) => state.dailyGoal)
  const { t } = useLanguage()

  // 连续天数沿用 streak.ts 的统一口径（今天没学不算断签）
  const streak = calculateStreak(activityDays).count
  const achievements = computeAchievements({
    store,
    activityDays,
    streak,
    dailyGoal,
  })
  const achievementLabels = {
    'first-mastered': {
      title: t('achievement.firstSentence.title'),
      description: t('achievement.firstSentence.description'),
    },
    'mastered-50': {
      title: t('achievement.rising.title'),
      description: t('achievement.rising.description'),
    },
    'mastered-100': {
      title: t('achievement.hundred.title'),
      description: t('achievement.hundred.description'),
    },
    'chapter-complete': {
      title: t('achievement.chapter.title'),
      description: t('achievement.chapter.description'),
    },
    'streak-3': {
      title: t('achievement.streak3.title'),
      description: t('achievement.streak3.description'),
    },
    'streak-7': {
      title: t('achievement.streak7.title'),
      description: t('achievement.streak7.description'),
    },
    'repeat-200': {
      title: t('achievement.repeat.title'),
      description: t('achievement.repeat.description'),
    },
    'daily-goal': {
      title: t('achievement.goal.title'),
      description: t('achievement.goal.description', { count: dailyGoal }),
    },
  } as const

  if (!achievements.some((achievement) => achievement.unlocked)) {
    return null
  }

  return (
    <View className="rounded-[24px] border-2 border-[#e4eef8] border-b-[6px] border-b-[#d7e4ef] bg-white px-5 py-5">
      <View className="flex-row items-center">
        <FontAwesome6 color="#ffc800" name="medal" size={16} />
        <Text className="ml-2 text-lg font-black text-text-primary">{t('growth.achievements')}</Text>
      </View>

      <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
        {achievements.map((achievement) => (
          <View
            key={achievement.id}
            className={`w-[48%] flex-1 items-center rounded-[18px] border-2 px-3 py-4 ${
              achievement.unlocked
                ? 'border-[#d8f2c2] bg-[#f4fcec]'
                : 'border-[#eef5fb] bg-[#f7fbff]'
            }`}
            style={{ minWidth: 140 }}
          >
            <View
              className={`h-12 w-12 items-center justify-center rounded-full ${
                achievement.unlocked ? 'bg-success' : 'bg-surface-raised'
              }`}
            >
              <FontAwesome6
                color={achievement.unlocked ? '#ffffff' : '#8191a6'}
                name={achievement.unlocked ? achievement.icon : 'lock'}
                size={18}
              />
            </View>
            <Text
              className={`mt-2 text-center text-sm font-black ${
                achievement.unlocked ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {achievementLabels[achievement.id].title}
            </Text>
            <Text className="mt-0.5 text-center text-xs font-bold text-text-secondary">
              {achievementLabels[achievement.id].description}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
