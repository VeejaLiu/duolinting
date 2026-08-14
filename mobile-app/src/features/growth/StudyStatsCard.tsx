import { FontAwesome6 } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import {
  calculateStudyDashboardSummary,
  calculateStudyTimelineSummary,
} from '@duolinting/domain'
import { useCatalogQuery } from '@/features/catalog/hooks'
import { formatLocalDay, useActivityStore } from '@/stores/activityStore'
import { useStudyStore } from '@/stores/studyStore'
import { useLanguage } from '@/i18n/LanguageProvider'

/** 统计数字小格：大数字 + 小标题 */
function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center rounded-[18px] bg-[#f7fbff] px-2 py-4">
      <Text className="text-2xl font-black text-text-primary">{value}</Text>
      <Text className="mt-1 text-xs font-black text-text-secondary">{label}</Text>
    </View>
  )
}

/** 柱状图绘图区高度（px），柱子高度归一化到这个值 */
const CHART_HEIGHT = 88

/**
 * 近 7 天掌握数柱状小图：纯 View 实现，不引图表库。
 * 数据口径与 activityStore 一致——"当天点下掌握的次数"，
 * 柱子高度按 7 天内的最大值归一化，全 0 时统一显示最矮的空柱。
 */
function WeeklyBarChart({
  days,
  uiLocale,
  todayLabel,
}: {
  days: Record<string, { masteredCount: number }>
  uiLocale: string
  todayLabel: string
}) {
  // 近 7 天（含今天），从早到晚排列；用本地午夜构造日期，
  // 与 formatLocalDay 的本地时区口径对齐
  const now = new Date()
  const points: Array<{ label: string; count: number; isToday: boolean }> = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const key = formatLocalDay(date)
    points.push({
      label: offset === 0
        ? todayLabel
        : new Intl.DateTimeFormat(uiLocale, { weekday: 'narrow' }).format(date),
      count: days[key]?.masteredCount ?? 0,
      isToday: offset === 0,
    })
  }

  const maxCount = Math.max(1, ...points.map((point) => point.count))

  return (
    <View className="mt-4 flex-row items-end justify-between">
      {points.map((point, index) => {
        // 归一化高度；有数据的最矮柱也给 10px 保证可见，0 值显示 4px 空柱
        const height =
          point.count > 0
            ? Math.max(10, Math.round((point.count / maxCount) * CHART_HEIGHT))
            : 4
        const barColor =
          point.count > 0
            ? point.isToday
              ? 'bg-brand'
              : 'bg-success'
            : 'bg-surface-raised'

        return (
          <View key={index} className="flex-1 items-center">
            <Text className="mb-1 text-[10px] font-black text-text-muted">
              {point.count > 0 ? point.count : ''}
            </Text>
            <View
              className={`w-[16px] rounded-full ${barColor}`}
              style={{ height }}
            />
            <Text
              className={`mt-1.5 text-[10px] font-black ${
                point.isToday ? 'text-brand' : 'text-text-secondary'
              }`}
            >
              {point.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * 学习统计卡（成长 tab）：四个统计格 + 近 7 天柱状图。
 * 统计口径全部来自本地数据，不请求额外接口：
 * - dashboard（domain 函数）：总掌握句数 / 总复读次数，
 *   只统计目录里仍存在的章节，已下线章节的本地残留不计入；
 * - timeline（domain 函数）：今天练过的章节数；
 * - 累计学习天数 / 近 7 天柱状图：直接读 activityStore 的活动日历。
 * 目录还没加载到时按空数组算，统计区先显示 0（整体落入空态提示）。
 */
export function StudyStatsCard() {
  const store = useStudyStore((state) => state.store)
  const activityDays = useActivityStore((state) => state.days)
  const { data: catalog } = useCatalogQuery()
  const { t, uiLocale } = useLanguage()

  const exercises = catalog?.exercises ?? []
  const dashboard = calculateStudyDashboardSummary(exercises, store)
  const timeline = calculateStudyTimelineSummary(exercises, store)
  const studiedDayCount = Object.keys(activityDays).length
  const hasAnyStats =
    dashboard.masteredLineCount > 0 ||
    dashboard.repeatCount > 0 ||
    studiedDayCount > 0

  return (
    <View className="rounded-[24px] border-2 border-[#e4eef8] border-b-[6px] border-b-[#d7e4ef] bg-white px-5 py-5">
      <View className="flex-row items-center">
        <FontAwesome6 color="#1cb0f6" name="chart-simple" size={16} />
        <Text className="ml-2 text-lg font-black text-text-primary">
          {t('growth.stats')}
        </Text>
      </View>

      {hasAnyStats ? (
        <>
          <View className="mt-4 flex-row" style={{ gap: 10 }}>
            <StatTile value={dashboard.masteredLineCount} label={t('growth.totalMastered')} />
            <StatTile value={dashboard.repeatCount} label={t('growth.totalRepeats')} />
          </View>
          <View className="mt-2.5 flex-row" style={{ gap: 10 }}>
            <StatTile value={studiedDayCount} label={t('growth.studyDays')} />
            <StatTile
              value={timeline.todayTouchedExerciseCount}
              label={t('growth.todayChapters')}
            />
          </View>
          <View className="mt-4 border-t-2 border-[#eef5fb] pt-4">
            <Text className="text-sm font-black text-text-secondary">
              {t('growth.weekMastered')}
            </Text>
            <WeeklyBarChart days={activityDays} todayLabel={t('growth.today')} uiLocale={uiLocale} />
          </View>
        </>
      ) : (
        <View className="mt-4 items-center rounded-[18px] bg-[#f7fbff] px-4 py-6">
          <FontAwesome6 color="#8191a6" name="seedling" size={22} />
          <Text className="mt-2 text-center text-sm font-bold text-text-secondary">
            {t('growth.noData')}
          </Text>
        </View>
      )}
    </View>
  )
}
