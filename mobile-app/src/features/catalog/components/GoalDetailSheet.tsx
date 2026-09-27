import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { BottomSheet } from '@/components/foundation/BottomSheet'
import { ProgressBar } from '@/components/foundation/ProgressBar'
import { formatLocalDay, useActivityStore } from '@/stores/activityStore'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 今日目标详情弹层（点首页 bullseye 图标弹出）。
 * 展示今日掌握进度；偏好修改统一进入学习设置。
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
  const router = useRouter()
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

        <Pressable accessibilityRole="button" className="mt-2 min-h-[56px] flex-row items-center rounded-[16px] border border-[#d7e2ee] bg-white px-4 active:border-[#1cb0f6]" onPress={() => { onClose(); router.push('/settings/learning') }}>
          <Text className="flex-1 text-base font-bold text-text-primary">{t('goal.dailyGoal')}</Text>
          <Text className="mr-3 text-sm text-text-secondary">{t('settings.sentences', { count: dailyGoal })}</Text>
          <FontAwesome6 color="#8191a6" name="chevron-right" size={14} />
        </Pressable>

        {/* 计数口径说明 */}
        <Text className="mt-4 text-[11px] leading-4 text-text-muted">
          {t('goal.explanation')}
        </Text>
      </View>
    </BottomSheet>
  )
}
