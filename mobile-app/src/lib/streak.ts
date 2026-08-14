import { formatLocalDay } from '@/stores/activityStore'

/**
 * 连续学习天数的计算结果：
 * - count: 连续天数；
 * - includesToday: 今天是否已计入连续记录。
 *   false 表示"待续"——昨天及以前连续，但今天还没学，
 *   UI 用灰色火焰弱化提示用户今天别断。
 */
export type StreakResult = {
  count: number
  includesToday: boolean
}

/**
 * 连续天数口径：
 * - 从今天往前数连续有活动记录（days 里有键）的天数；
 * - 今天还没有记录时不算断签，从昨天往前数（此时 includesToday=false，
 *   是"待续"态），今天一旦有记录立即计入；
 * - 昨天也没有记录时 count=0，UI 不显示 streak 胶囊。
 *
 * 实现细节：游标用"本地午夜"构造（new Date(y, m, d)），逐天 setDate(-1)
 * 回退，靠 Date 自己处理跨月/跨年，键比较统一走 formatLocalDay
 * 的本地时区口径，与 activityStore 写键的口径完全一致。
 */
export const calculateStreak = (
  days: Record<string, { masteredCount: number }>,
  now = new Date(),
): StreakResult => {
  const todayKey = formatLocalDay(now)
  const includesToday = Boolean(days[todayKey])

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!includesToday) {
    // 今天还没学：从昨天开始往前数，连续记录处于"待续"状态
    cursor.setDate(cursor.getDate() - 1)
  }

  let count = 0
  while (days[formatLocalDay(cursor)]) {
    count += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return { count, includesToday }
}
