import { FontAwesome6 } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { BottomSheet } from '@/components/foundation/BottomSheet'
import { ProgressBar } from '@/components/foundation/ProgressBar'
import { formatLocalDay, useActivityStore } from '@/stores/activityStore'
import { useLanguage } from '@/i18n/LanguageProvider'

/** 每日目标可选档位（句/天），与多邻国"每日目标"档位交互一致 */
const GOAL_OPTIONS = [5, 10, 20, 50]

/**
 * 今日目标详情弹层（点首页 bullseye 图标弹出）。
 * 展示今日掌握进度，并允许直接切换每日目标档位（写回 activityStore）。
 */
export function GoalDetailSheet({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const activityDays = useActivityStore((state) => state.days)
  const dailyGoal = useActivityStore((state) => state.dailyGoal)
  const setDailyGoal = useActivityStore((state) => state.setDailyGoal)
  const { t } = useLanguage()

  const todayKey = formatLocalDay(new Date())
  const masteredToday = activityDays[todayKey]?.masteredCount ?? 0
  const goalReached = masteredToday >= dailyGoal
  // 进度条百分比：目标可能为 0 以外的任意正数，除法前由 store 的
  // setDailyGoal 兜底保证 dailyGoal >= 1，这里再 clamp 到 0-100
  const percent = Math.min(100, Math.round((masteredToday / dailyGoal) * 100))

  return (
    <BottomSheet onClose={onClose} title={t('goal.title')} visible={visible}>
      <View className="px-6 pb-2">
        {/* 今日进度：x/N + 进度条；达标后变绿色对勾文案 */}
        <View className="items-center py-4">
          {goalReached ? (
            <View className="flex-row items-center">
              <FontAwesome6 color="#58cc02" name="circle-check" size={22} />
              <Text className="ml-2 text-xl font-black text-success">
                {t('goal.completed')}
              </Text>
            </View>
          ) : (
            <Text className="text-xl font-black text-text-primary">
              {t('goal.progress', { mastered: masteredToday, goal: dailyGoal })}
            </Text>
          )}
          <View className="mt-4 w-full">
            <ProgressBar percent={percent} />
          </View>
        </View>

        {/* 每日目标档位胶囊：选中态蓝底白字 */}
        <Text className="mt-2 text-xs font-black text-text-secondary">{t('goal.dailyGoal')}</Text>
        <View className="mt-2 flex-row gap-2">
          {GOAL_OPTIONS.map((option) => {
            const selected = option === dailyGoal
            return (
              <Pressable
                key={option}
                className={`flex-1 items-center rounded-pill border-b-4 py-2.5 ${
                  selected
                    ? 'border-b-[#0d8fcb] bg-brand'
                    : 'border-b-[#c9d2de] bg-surface-raised'
                }`}
                onPress={() => setDailyGoal(option)}
              >
                <Text
                  className={`text-sm font-black ${
                    selected ? 'text-white' : 'text-text-secondary'
                  }`}
                >
                  {t('settings.sentences', { count: option })}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* 计数口径说明 */}
        <Text className="mt-4 text-[11px] leading-4 text-text-muted">
          {t('goal.explanation')}
        </Text>
      </View>
    </BottomSheet>
  )
}
