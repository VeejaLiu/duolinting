import { FontAwesome6 } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  calculateChapterProgress,
  calculateSeriesProgress,
  type CatalogExerciseSummary,
} from '@duolinting/domain'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { AppImage } from '@/components/primitives/AppImage'
import { EmptyState } from '@/components/foundation/EmptyState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { Spinner } from '@/components/foundation/Spinner'
import { apiClient } from '@/lib/apiClient'
import { calculateStreak, type StreakResult } from '@/lib/streak'
import { formatLocalDay, useActivityStore } from '@/stores/activityStore'
import { useNavigationStore } from '@/stores/navigationStore'
import { useStudyStore } from '@/stores/studyStore'
import { useCatalogQuery, useCategoryExercisesQuery } from './hooks'
import { GoalDetailSheet } from './components/GoalDetailSheet'
import { StreakDetailSheet } from './components/StreakDetailSheet'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 顶部状态条（多邻国式裸图标行，无卡片无边框）：
 * - 火焰 + 连续天数：今天已学=橙色 #ff9600，"待续"（昨天起有连续记录但今天还没学）
 *   或 count=0 = 灰色 #9fb0c3；路径式首页要求它始终在位，所以 count=0 也显示 0；
 * - bullseye + 今日目标 x/N：x=今日已掌握句数（activityStore，取消掌握不扣减），
 *   N=每日目标；达标（x>=N）时数字变绿；
 * - 两个图标区都可点击，分别弹出连续学习/今日目标详情底部弹层
 *   （对标多邻国连胜详情页），hitSlop 12 保证触达区域不小于 44px；
 * - 右端展示品牌耳朵标志，作为首页信息条的视觉收尾。
 */
function HomeStatBar({
  streak,
  masteredToday,
  dailyGoal,
  onPressStreak,
  onPressGoal,
}: {
  streak: StreakResult
  masteredToday: number
  dailyGoal: number
  onPressStreak: () => void
  onPressGoal: () => void
}) {
  const { t } = useLanguage()
  const streakActive = streak.includesToday && streak.count > 0
  const flameColor = streakActive ? '#ff9600' : '#9fb0c3'
  const goalReached = masteredToday >= dailyGoal

  return (
    <View className="flex-row items-center px-5 py-3">
      <Pressable className="flex-row items-center" hitSlop={12} onPress={onPressStreak}>
        <FontAwesome6 color={flameColor} name="fire" size={18} />
        <Text
          className={`ml-1.5 text-base font-black ${
            streakActive ? 'text-[#ff9600]' : 'text-text-muted'
          }`}
        >
          {streak.count}
        </Text>
      </Pressable>
      <Pressable
        className="ml-6 flex-row items-center"
        hitSlop={12}
        onPress={onPressGoal}
      >
        <FontAwesome6 color="#1cb0f6" name="bullseye" size={16} />
        <Text
          className={`ml-1.5 text-base font-black ${
            goalReached ? 'text-success' : 'text-text-primary'
          }`}
        >
          {t('catalog.todayProgress', { mastered: masteredToday, goal: dailyGoal })}
        </Text>
      </Pressable>
      <View className="flex-1" />
      <Image
        accessibilityLabel="DuolinTing"
        contentFit="contain"
        source={require('../../../assets/duolinting-logo-ear.png')}
        style={{ height: 22, width: 24 }}
      />
    </View>
  )
}

/**
 * 绿色单元横幅大卡（沿用原 Hero 的绿色 chunky 样式）：
 * 左侧系列封面（无封面时显示系列名首字的文字块）+ 小标签"当前系列" + 系列名
 * + 系列级掌握进度（已掌握 x/y 句 · z%）；
 * 右侧白色圆角方块按钮（list-ul 图标）跳转 /series 切换系列。
 */
function SeriesBanner({
  name,
  coverImageUrl,
  masteredLineCount,
  totalLineCount,
  percent,
  onPress,
}: {
  name: string
  coverImageUrl?: string
  masteredLineCount: number
  totalLineCount: number
  percent: number
  onPress: () => void
}) {
  const { t } = useLanguage()
  // 与 CourseListItem 同一口径：封面缺失或加载失败时回落为名称首字文字块
  const coverUrl = apiClient.resolveApiUrl(coverImageUrl)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [coverUrl])
  const showCover = Boolean(coverUrl) && !imageFailed

  return (
    <View className="flex-row items-center rounded-[26px] border-2 border-[#58cc02] border-b-[6px] border-b-[#46a302] bg-success px-5 py-5">
      <View className="mr-4 h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] bg-white">
        {showCover && coverUrl ? (
          <AppImage
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: coverUrl }}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <Text className="text-2xl font-black text-success">{coverInitial(name)}</Text>
        )}
      </View>
      <View className="flex-1 pr-4">
        <Text className="text-xs font-black text-[#e6f9d9]">{t('catalog.currentSeries')}</Text>
        <Text className="mt-1 text-xl font-black text-white" numberOfLines={2}>
          {name}
        </Text>
        <Text className="mt-1 text-xs font-bold text-[#e6f9d9]">
          {t('catalog.masteredProgress', { mastered: masteredLineCount, total: totalLineCount, percent })}
        </Text>
      </View>
      <Pressable
        className="h-14 w-14 items-center justify-center rounded-[18px] bg-white"
        onPress={onPress}
      >
        <FontAwesome6 color="#58cc02" name="list-ul" size={20} />
      </Pressable>
    </View>
  )
}

/**
 * 课程路径专用滚动指示器：
 * - thumb 高度 = 可视高度 / 内容总高度，保证课程越多滑块越短；
 * - thumb 位置 = 当前滚动距离 / 最大可滚动距离，保证与列表位置一一对应；
 * - 轨道与滑块使用品牌浅蓝和蓝色，替代系统原生滚动条的灰色样式。
 */
function CoursePathScrollIndicator({
  contentHeight,
  offsetY,
  viewportHeight,
}: {
  contentHeight: number
  offsetY: number
  viewportHeight: number
}) {
  const { t } = useLanguage()
  if (contentHeight <= viewportHeight || viewportHeight <= 0) {
    return null
  }

  const trackHeight = Math.max(viewportHeight - 24, 0)
  const thumbHeight = Math.max(
    36,
    Math.min(trackHeight, (viewportHeight / contentHeight) * trackHeight),
  )
  const maxOffset = Math.max(contentHeight - viewportHeight, 1)
  const thumbTravel = Math.max(trackHeight - thumbHeight, 0)
  const thumbOffset = Math.min(
    thumbTravel,
    Math.max(0, offsetY / maxOffset) * thumbTravel,
  )

  return (
    <View
      pointerEvents="none"
      className="absolute bottom-3 right-1.5 top-3 w-2 overflow-hidden rounded-full bg-[#e1f4fe]"
    >
      <View
        className="w-2 rounded-full border border-[#0f91d0] bg-brand"
        style={{ height: thumbHeight, transform: [{ translateY: thumbOffset }] }}
      />
    </View>
  )
}

/**
 * 无封面时的文字兜底：取名称第一个字符（中文取首字，英文取首字母大写），
 * 作为封面位置的文字块内容。
 */
const coverInitial = (name: string): string => (name.trim().charAt(0) || '?').toUpperCase()

/**
 * 课程列表项：封面固定在左侧，标题和可选摘要集中在右侧，方便长列表快速扫读。
 * 摘要最多显示两行；没有摘要时不占位，避免课程卡出现无意义的空白。
 */
function CourseListItem({
  exercise,
  percent,
  masteredLineCount,
  totalLineCount,
  isCurrent,
  onPress,
}: {
  exercise: CatalogExerciseSummary
  percent: number
  masteredLineCount: number
  totalLineCount: number
  isCurrent: boolean
  onPress: () => void
}) {
  const { t } = useLanguage()
  /*
   * 封面加载失败回落：
   * coverImageUrl 经 resolveApiUrl 解析成可访问地址；imageFailed 记录加载失败，
   * url 变化时重置以便重新尝试。缺失或失败都回落为浅蓝底 + 课程全名文字块。
   */
  const coverUrl = apiClient.resolveApiUrl(exercise.coverImageUrl)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [coverUrl])
  const showCover = Boolean(coverUrl) && !imageFailed
  const completed = percent >= 100
  const statusLabel = completed
    ? t('catalog.completed')
    : isCurrent
      ? t('catalog.continue')
      : percent > 0 ? `${percent}%` : t('catalog.notStarted')
  const statusStyle = completed
    ? { container: 'bg-[#ecffe4]', text: 'text-success' }
    : isCurrent || percent > 0
      ? { container: 'bg-[#e1f4fe]', text: 'text-brand' }
      : { container: 'bg-[#f0f4f8]', text: 'text-text-secondary' }

  return (
    <Pressable
      className={`flex-row rounded-[18px] border-2 border-b-[5px] bg-white p-3 ${
        completed
          ? 'border-[#bce6a3] border-b-[#9bd37d]'
          : isCurrent
            ? 'border-brand border-b-[#0f91d0]'
            : 'border-[#dce8f3] border-b-[#cfe0ee]'
      }`}
      onPress={onPress}
    >
      <View className="h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-[14px] bg-[#edf7ff]">
        {showCover && coverUrl ? (
          <AppImage
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: coverUrl }}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          /* 无封面时用课程全名做文字封面：小字号居中、最多 3 行、
             水平留白 4px，长标题截断不溢出 84px 方块。 */
          <Text className="px-1 text-center text-xs font-black leading-4 text-brand" numberOfLines={3}>
            {exercise.title}
          </Text>
        )}
      </View>

      <View className="ml-3 flex-1 justify-between py-0.5">
        <View className="flex-row items-start">
          <Text className="mr-2 flex-1 text-base font-black leading-5 text-text-primary" numberOfLines={2}>
            {exercise.title}
          </Text>
          <View className={`rounded-pill px-2 py-1 ${statusStyle.container}`}>
            <Text className={`text-[10px] font-black ${statusStyle.text}`}>
              {statusLabel}
            </Text>
          </View>
        </View>
        {exercise.summary ? (
          <Text
            className="mt-1 text-xs font-bold leading-4 text-text-secondary"
            numberOfLines={2}
          >
            {exercise.summary}
          </Text>
        ) : null}
        <View className="mt-2">
          <View className="h-1.5 overflow-hidden rounded-pill bg-[#e4eef8]">
            <View className="h-full rounded-pill bg-success" style={{ width: `${percent}%` }} />
          </View>
          <Text className="mt-1 text-[10px] font-bold text-text-muted">
            {t('catalog.masteredCount', { mastered: masteredLineCount, total: totalLineCount })}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

export function CatalogHomeScreen() {
  const router = useRouter()
  const { data: catalog, isLoading, isError, error } = useCatalogQuery()
  const store = useStudyStore((state) => state.store)
  const activeExerciseId = useStudyStore((state) => state.store.activeExerciseId)
  const activityDays = useActivityStore((state) => state.days)
  const dailyGoal = useActivityStore((state) => state.dailyGoal)
  const selectedSeriesId = useNavigationStore((state) => state.selectedSeriesId)
  const setSelectedSeriesId = useNavigationStore((state) => state.setSelectedSeriesId)
  const { t } = useLanguage()
  // 激励机制数据源：活动日历 + 每日目标，全部来自本地 activityStore
  const [streakSheetVisible, setStreakSheetVisible] = useState(false)
  const [goalSheetVisible, setGoalSheetVisible] = useState(false)
  const [pathContentHeight, setPathContentHeight] = useState(0)
  const [pathOffsetY, setPathOffsetY] = useState(0)
  const [pathViewportHeight, setPathViewportHeight] = useState(0)
  const todayKey = formatLocalDay(new Date())
  const masteredToday = activityDays[todayKey]?.masteredCount ?? 0
  const streak = calculateStreak(activityDays)
  const selectedSeries =
    catalog?.categories.find((category) => category.id === selectedSeriesId) ??
    catalog?.categories[0]
  const {
    data: selectedExercises,
    isLoading: exercisesLoading,
  } = useCategoryExercisesQuery(selectedSeries?.id ?? 0)
  // 章节按 sortOrder 排序，与系列详情页口径一致，"第 N 章"才讲得通
  const exercises = [...(selectedExercises ?? [])].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )
  const seriesProgress = calculateSeriesProgress(exercises, store)

  /*
   * "继续学习"目标章节，优先级：
   * 1) 上次学过（activeExerciseId）、仍在当前系列、且尚未学完的章节
   *    —— 章节被删除或已学完时自动失效，落到下一条；
   * 2) 第一个完成度 <100% 的章节；
   * 3) 全部完成时回落到第一章，Hero 变为复习引导（allCompleted 控制文案）。
   * 路径布局里 nextExercise 用于标记"当前"高亮节点。
   */
  const allCompleted =
    exercises.length > 0 &&
    exercises.every(
      (exercise) => calculateChapterProgress(exercise, store).percent >= 100,
    )
  const lastStudiedIncomplete = exercises.find(
    (exercise) =>
      exercise.id === activeExerciseId &&
      calculateChapterProgress(exercise, store).percent < 100,
  )
  const nextExercise =
    lastStudiedIncomplete ??
    exercises.find(
      (exercise) => calculateChapterProgress(exercise, store).percent < 100,
    ) ??
    exercises[0]

  useEffect(() => {
    if (selectedSeries && selectedSeries.id !== selectedSeriesId) {
      setSelectedSeriesId(selectedSeries.id)
    }
  }, [selectedSeries, selectedSeriesId, setSelectedSeriesId])

  if (isLoading || !catalog || (selectedSeries && exercisesLoading && !selectedExercises)) {
    return (
      <SafeScreen>
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </SafeScreen>
    )
  }

  if (isError) {
    return (
      <SafeScreen>
        <View className="flex-1 px-4 py-5">
          <ErrorState
            message={t('catalog.loadFailed')}
          />
        </View>
      </SafeScreen>
    )
  }

  return (
    <SafeScreen>
      <View className="flex-1 bg-white">
        <HomeStatBar
          streak={streak}
          masteredToday={masteredToday}
          dailyGoal={dailyGoal}
          onPressStreak={() => setStreakSheetVisible(true)}
          onPressGoal={() => setGoalSheetVisible(true)}
        />
        {/* 当前系列是课程路径的固定上下文；切换入口不能随着章节列表滚出视野。 */}
        <View className="px-4 pb-2">
          {selectedSeries ? (
            <SeriesBanner
              name={selectedSeries.name}
              coverImageUrl={selectedSeries.coverImageUrl}
              masteredLineCount={seriesProgress.masteredLineCount}
              totalLineCount={seriesProgress.totalLineCount}
              percent={seriesProgress.percent}
              onPress={() => router.push('/series')}
            />
          ) : (
            <EmptyState
              title={t('catalog.noSeries')}
              description={t('catalog.noSeriesDescription')}
            />
          )}
        </View>
        <View className="relative flex-1">
          <AppScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            onContentSizeChange={(_, height) => setPathContentHeight(height)}
            onLayout={(event) => setPathViewportHeight(event.nativeEvent.layout.height)}
            onScroll={(event) => setPathOffsetY(event.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            {/* 课程列表：封面、标题、可选摘要和掌握进度均在单项内完成表达。 */}
            <View className="mt-2">
              {selectedSeries && exercises.length === 0 ? (
                <EmptyState
                  title={t('catalog.noChapters')}
                  description={t('catalog.noChaptersDescription')}
                />
              ) : (
                <View className="gap-3">
                  {exercises.map((exercise) => {
                    const chapterProgress = calculateChapterProgress(exercise, store)
                    return (
                    <CourseListItem
                      key={exercise.id}
                      exercise={exercise}
                      percent={chapterProgress.percent}
                      masteredLineCount={chapterProgress.masteredLineCount}
                      totalLineCount={chapterProgress.totalLineCount}
                      isCurrent={
                        !allCompleted && exercise.id === nextExercise?.id
                      }
                      onPress={() =>
                        router.push(`/study/${exercise.categoryId}/${exercise.id}`)
                      }
                    />
                    )
                  })}
                </View>
              )}
            </View>
          </AppScrollView>
          <CoursePathScrollIndicator
            contentHeight={pathContentHeight}
            offsetY={pathOffsetY}
            viewportHeight={pathViewportHeight}
          />
        </View>

        {/* 状态条详情弹层：Modal 本身是 portal，挂在滚动区外即可 */}
        <StreakDetailSheet
          onClose={() => setStreakSheetVisible(false)}
          visible={streakSheetVisible}
        />
        <GoalDetailSheet
          onClose={() => setGoalSheetVisible(false)}
          visible={goalSheetVisible}
        />
      </View>
    </SafeScreen>
  )
}
