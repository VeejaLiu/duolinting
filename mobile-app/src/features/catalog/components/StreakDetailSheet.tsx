import { FontAwesome6 } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { BottomSheet } from '@/components/foundation/BottomSheet'
import { calculateStreak } from '@/lib/streak'
import { formatLocalDay, useActivityStore } from '@/stores/activityStore'
import { useLanguage } from '@/i18n/LanguageProvider'

/** 周一起始的星期头（getDay() 是周日起始，格子偏移时要换算，见下方注释） */
/** 日历格子的列宽：7 列等分（百分比字符串，flex 布局） */
const CELL_WIDTH = '14.2857%'

/**
 * 连续学习详情弹层（点首页火焰图标弹出，对标多邻国连胜详情页）。
 * 数据全部来自本地 activityStore（活动日历），不请求接口。
 */
export function StreakDetailSheet({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const activityDays = useActivityStore((state) => state.days)
  const todayKey = formatLocalDay(new Date())
  const studiedToday = Boolean(activityDays[todayKey])
  const streak = calculateStreak(activityDays)
  const { t, uiLocale } = useLanguage()
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(uiLocale, { weekday: 'narrow' }).format(new Date(2024, 0, index + 1)),
  )

  /*
   * 日历当前展示的月份，用 {year, month(0-based)} 两个数字而不是 Date：
   * 翻月时只需做整数加减，避免 new Date(y, m+1, d) 在月末（如 1 月 31 日
   * 翻到 2 月）发生日期溢出导致跳月。
   */
  const now = new Date()
  const [displayMonth, setDisplayMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  })

  const shiftMonth = (delta: number) => {
    setDisplayMonth((current) => {
      // 把年月摊平成"总月数"再加减，天然处理跨年（12 月 ↔ 1 月）
      const total = current.year * 12 + current.month + delta
      return { year: Math.floor(total / 12), month: total % 12 }
    })
  }

  /*
   * 月视图格子的两个关键数字（全部本地时区口径）：
   * - daysInMonth：当月天数，用"下个月 0 号"=本月最后一天求得，
   *   Date 会自动处理大小月与闰年；
   * - leadingBlanks：1 号前面要空几格。getDay() 返回 0(周日)~6(周六)，
   *   我们的表头周一起始，换算成 (getDay()+6)%7：周一=0 格、周日=6 格。
   */
  const daysInMonth = new Date(displayMonth.year, displayMonth.month + 1, 0).getDate()
  const firstWeekday = new Date(displayMonth.year, displayMonth.month, 1).getDay()
  const leadingBlanks = (firstWeekday + 6) % 7

  // 组装格子：前导空格（day=0 占位）+ 1..daysInMonth
  const cells: number[] = [
    ...Array.from({ length: leadingBlanks }, () => 0),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  const flameColor = studiedToday ? '#ff9600' : '#9fb0c3'

  return (
    <BottomSheet onClose={onClose} title={t('streak.title')} visible={visible}>
      <View className="px-6 pb-2">
        {/* 大数字区：火焰 + "N 天连续学习！"，今天已学=橙火焰，否则灰火焰 */}
        <View className="items-center py-4">
          <FontAwesome6 color={flameColor} name="fire" size={56} />
          <Text className="mt-3 text-2xl font-black text-text-primary">
            {t('streak.days', { count: streak.count })}
          </Text>
          {!studiedToday ? (
            <Text className="mt-1.5 text-sm font-bold text-[#ff9600]">
              {t('streak.missedToday')}
            </Text>
          ) : null}
        </View>

        {/* 连续日历：月视图，周一起始 */}
        <View className="mt-2 rounded-[20px] border-2 border-border p-4">
          {/* 月份头部：左右翻月箭头 + "2026年7月" */}
          <View className="flex-row items-center justify-between">
            <Pressable
              className="h-8 w-8 items-center justify-center"
              hitSlop={12}
              onPress={() => shiftMonth(-1)}
            >
              <FontAwesome6 color="#1cb0f6" name="chevron-left" size={16} />
            </Pressable>
            <Text className="text-base font-black text-text-primary">
              {t('streak.month', { year: displayMonth.year, month: displayMonth.month + 1 })}
            </Text>
            <Pressable
              className="h-8 w-8 items-center justify-center"
              hitSlop={12}
              onPress={() => shiftMonth(1)}
            >
              <FontAwesome6 color="#1cb0f6" name="chevron-right" size={16} />
            </Pressable>
          </View>

          {/* 星期头（周一起始） */}
          <View className="mt-3 flex-row">
            {weekdayLabels.map((label, index) => (
              <View key={`${label}-${index}`} style={{ width: CELL_WIDTH }} className="items-center">
                <Text className="text-[10px] font-black text-text-muted">{label}</Text>
              </View>
            ))}
          </View>

          {/* 日期格子：活跃日 = 火焰 + 日期数字，今天加 brand 蓝高亮圆圈，未来日期灰字 */}
          <View className="mt-1 flex-row flex-wrap">
            {cells.map((day, index) => {
              if (day === 0) {
                // 前导占位格：key 用负数索引避免与真实日期冲突
                return <View key={`blank-${index}`} style={{ width: CELL_WIDTH }} />
              }
              // 日期键与 activityStore 写入口径一致：本地时区 yyyy-MM-dd
              const dayKey = formatLocalDay(
                new Date(displayMonth.year, displayMonth.month, day),
              )
              const entry = activityDays[dayKey]
              const isToday = dayKey === todayKey
              // yyyy-MM-dd 零填充格式可直接字符串比较大小
              const isFuture = dayKey > todayKey

              return (
                <View
                  key={dayKey}
                  style={{ width: CELL_WIDTH }}
                  className="items-center py-0.5"
                >
                  <View
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      isToday ? 'border-2 border-brand' : ''
                    }`}
                  >
                    {entry ? (
                      // 活跃日：小火焰 + 日期数字并排（覆盖方案在小字号下可读性差）
                      <View className="flex-row items-center">
                        <FontAwesome6 color="#ff9600" name="fire" size={9} />
                        <Text className="ml-0.5 text-xs font-black text-text-primary">
                          {day}
                        </Text>
                      </View>
                    ) : (
                      <Text
                        className={`text-xs font-bold ${
                          isFuture ? 'text-text-muted' : 'text-text-primary'
                        }`}
                      >
                        {day}
                      </Text>
                    )}
                  </View>
                  {/* 活跃日下方 9px 小字显示当天掌握句数（没有记录不显示，占位保持一致行高） */}
                  <Text className="text-[9px] font-bold text-text-muted">
                    {entry && entry.masteredCount > 0
                      ? t('streak.sentences', { count: entry.masteredCount })
                      : ' '}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      </View>
    </BottomSheet>
  )
}
