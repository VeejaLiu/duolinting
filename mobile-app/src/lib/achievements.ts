import type { StudyStore } from '@duolinting/domain'
import { formatLocalDay } from '@/stores/activityStore'

/**
 * 成就徽章：
 * - id: 稳定标识，用于 React key 与埋点；
 * - icon: FontAwesome6 图标名；
 * - unlocked: 是否已解锁，由 computeAchievements 按本地数据判定。
 *
 * 全部为纯本地判定（学习存档 + 活动日历），不依赖服务端。
 */
export type AchievementId =
  | 'first-mastered'
  | 'mastered-50'
  | 'mastered-100'
  | 'chapter-complete'
  | 'streak-3'
  | 'streak-7'
  | 'repeat-200'
  | 'daily-goal'

export type Achievement = {
  id: AchievementId
  icon: string
  unlocked: boolean
}

export type AchievementInput = {
  /** 学习存档（每章节的句子进度），来自 studyStore */
  store: StudyStore
  /** 活动日历（yyyy-MM-dd → 当天掌握次数），来自 activityStore */
  activityDays: Record<string, { masteredCount: number }>
  /** 当前连续学习天数，由 calculateStreak 算好传入 */
  streak: number
  /** 每日目标句数（"今日达标"徽章用），来自 activityStore */
  dailyGoal: number
}

export function computeAchievements(input: AchievementInput): Achievement[] {
  const { store, activityDays, streak, dailyGoal } = input

  /*
   * 总量口径：遍历所有章节的 lines 累加。
   * - totalMastered：当前处于 mastered 的句子总数（取消掌握会减）；
   * - totalRepeat：repeatCount 累加（只增不减的历史投入）；
   * 与排行榜"当前掌握量"口径一致，但这里是纯本地数据，
   * 可能包含已下线章节的残留进度——作为激励展示可以接受。
   */
  let totalMastered = 0
  let totalRepeat = 0
  let hasCompletedChapter = false
  for (const progress of Object.values(store.progressByExercise)) {
    const lines = Object.values(progress.lines ?? {})
    const masteredInChapter = lines.filter((line) => line.mastered).length
    totalMastered += masteredInChapter
    totalRepeat += lines.reduce((sum, line) => sum + (line.repeatCount ?? 0), 0)
    // 章节完成 = 该章有学习记录的行全部 mastered 且行数 > 0
    if (lines.length > 0 && masteredInChapter === lines.length) {
      hasCompletedChapter = true
    }
  }

  // 今天掌握次数：活动日历里"今天点下掌握的次数"，达到每日目标即解锁
  const todayMastered = activityDays[formatLocalDay(new Date())]?.masteredCount ?? 0

  return [
    {
      id: 'first-mastered',
      icon: 'flag',
      unlocked: totalMastered >= 1,
    },
    {
      id: 'mastered-50',
      icon: 'star-half-stroke',
      unlocked: totalMastered >= 50,
    },
    {
      id: 'mastered-100',
      icon: 'star',
      unlocked: totalMastered >= 100,
    },
    {
      id: 'chapter-complete',
      icon: 'crown',
      unlocked: hasCompletedChapter,
    },
    {
      id: 'streak-3',
      icon: 'fire',
      unlocked: streak >= 3,
    },
    {
      id: 'streak-7',
      icon: 'fire-flame-curved',
      unlocked: streak >= 7,
    },
    {
      id: 'repeat-200',
      icon: 'repeat',
      unlocked: totalRepeat >= 200,
    },
    {
      id: 'daily-goal',
      icon: 'bullseye',
      unlocked: todayMastered >= dailyGoal,
    },
  ]
}
