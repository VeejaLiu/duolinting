import { FontAwesome6 } from '@expo/vector-icons'
import { useQueries } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  calculateSeriesProgress,
  type CatalogExerciseSummary,
} from '@duolinting/domain'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { AppImage } from '@/components/primitives/AppImage'
import { EmptyState } from '@/components/foundation/EmptyState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { ProgressBar } from '@/components/foundation/ProgressBar'
import { Spinner } from '@/components/foundation/Spinner'
import { apiClient } from '@/lib/apiClient'
import { useCatalogQuery } from './hooks'
import { useNavigationStore } from '@/stores/navigationStore'
import { useStudyStore } from '@/stores/studyStore'
import { useLanguage } from '@/i18n/LanguageProvider'

function CoverImage({
  accent,
  iconName = 'headphones',
  imageUrl,
  sizeClassName,
}: {
  accent: string
  iconName?: ComponentProps<typeof FontAwesome6>['name']
  imageUrl?: string
  sizeClassName: string
}) {
  const resolvedImageUrl = apiClient.resolveApiUrl(imageUrl)

  return (
    <View
      className={`${sizeClassName} overflow-hidden items-center justify-center rounded-[16px]`}
      style={{ backgroundColor: resolvedImageUrl ? '#edf7ff' : accent }}
    >
      {resolvedImageUrl ? (
        <AppImage
          resizeMode="cover"
          source={{ uri: resolvedImageUrl }}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <FontAwesome6 color="#ffffff" name={iconName} size={18} />
      )}
    </View>
  )
}

export function SeriesPickerScreen() {
  const router = useRouter()
  const { data: catalog, isLoading, isError, error } = useCatalogQuery()
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const store = useStudyStore((state) => state.store)
  const syncReady = useStudyStore((state) => state.syncReady)
  const syncStatus = useStudyStore((state) => state.syncStatus)
  const selectedSeriesId = useNavigationStore((state) => state.selectedSeriesId)
  const setSelectedSeriesId = useNavigationStore((state) => state.setSelectedSeriesId)
  const { contentLocale, t } = useLanguage()
  const groupedSeries = (catalog?.categoryGroups ?? [])
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((group) => ({
      group,
      categories: (catalog?.categories ?? [])
        .filter((category) => category.groupId === group.id)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    }))
    .filter((item) => item.categories.length > 0)
  const groupedCategoryIds = new Set(
    groupedSeries.flatMap((item) => item.categories.map((category) => category.id)),
  )
  const ungroupedCategories = (catalog?.categories ?? [])
    .filter((category) => !groupedCategoryIds.has(category.id))
    .sort((left, right) => left.sortOrder - right.sortOrder)
  const groups = [
    ...groupedSeries,
    ...(ungroupedCategories.length > 0
      ? [
          {
            group: {
              id: -1,
              name: t('catalog.otherSeries'),
              description: '',
              accent: '#1cb0f6',
              sortOrder: Number.MAX_SAFE_INTEGER,
            },
            categories: ungroupedCategories,
          },
        ]
      : []),
  ]
  const selectedGroup =
    groups.find((item) => item.group.id === selectedGroupId) ?? groups[0]
  const exerciseQueries = useQueries({
    queries: (catalog?.categories ?? []).map((category) => ({
      queryKey: ['catalog', 'category-exercises', category.id, contentLocale],
      queryFn: () => apiClient.getCategoryExercises(category.id, contentLocale),
      enabled: category.id > 0,
      refetchOnMount: 'always',
    })),
  })
  const exercisesByCategory = Object.fromEntries(
    (catalog?.categories ?? []).map((category, index) => [
      category.id,
      exerciseQueries[index]?.data ?? [],
    ]),
  ) as Record<number, CatalogExerciseSummary[]>
  const exerciseLoadingByCategory = Object.fromEntries(
    (catalog?.categories ?? []).map((category, index) => [
      category.id,
      exerciseQueries[index]?.isLoading ?? false,
    ]),
  ) as Record<number, boolean>
  const getSeriesExercises = (categoryId: number) =>
    [...(exercisesByCategory[categoryId] ?? [])].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    )
  const progressPending = syncStatus !== 'local' && !syncReady

  if (isLoading || !catalog) {
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
            message={t('catalog.seriesLoadFailed')}
          />
        </View>
      </SafeScreen>
    )
  }

  const renderGroupNav = () =>
    groups.map(({ group }) => {
      const active = group.id === selectedGroup?.group.id
      return (
        <Pressable
          key={group.id}
          className={`mb-2 min-h-[64px] justify-center rounded-[14px] border-l-[4px] px-2.5 py-3 ${
            active
              ? 'border-l-[#1cb0f6] bg-white'
              : 'border-l-transparent bg-transparent'
          }`}
          onPress={() => setSelectedGroupId(group.id)}
        >
          <Text
            className={`text-left text-[13px] font-black leading-4 ${
              active ? 'text-text-primary' : 'text-text-secondary'
            }`}
            numberOfLines={2}
          >
            {group.name}
          </Text>
        </Pressable>
      )
    })

  const renderSeriesCards = () =>
    selectedGroup?.categories.map((category) => {
      const selected = category.id === selectedSeriesId
      const exercises = getSeriesExercises(category.id)
      const exercisesLoading = exerciseLoadingByCategory[category.id] ?? false
      const seriesProgress = calculateSeriesProgress(exercises, store)

      return (
        <Pressable
          key={category.id}
          className={`rounded-[20px] border-2 border-b-[5px] bg-white px-3 py-3 ${
            selected
              ? 'border-[#1cb0f6] border-b-[#0f91d0]'
              : 'border-[#dce8f3] border-b-[#cfe0ee]'
          }`}
          onPress={() => {
            setSelectedSeriesId(category.id)
            // 选中后关闭 modal 即可：首页挂在下方且监听 selectedSeriesId，
            // 回到首页会自动切换到新系列；比 replace 导航栈更干净
            router.back()
          }}
        >
          <View className="flex-row items-start">
            <CoverImage
              accent={category.accent}
              imageUrl={category.coverImageUrl}
              sizeClassName="h-16 w-16"
            />
            <View className="ml-3 flex-1">
              <View className="flex-row items-center justify-between">
                <Text className="mr-3 flex-1 text-lg font-black text-text-primary" numberOfLines={2}>
                  {category.name}
                </Text>
                <View className="items-end">
                  <Text className="text-base font-black text-brand">
                    {progressPending || exercisesLoading ? '--' : `${seriesProgress.percent}%`}
                  </Text>
                  {selected ? (
                    <FontAwesome6 color="#1cb0f6" name="circle-check" size={17} />
                  ) : null}
                </View>
              </View>
              <Text
                className="mt-1 text-sm font-bold text-text-secondary"
                numberOfLines={1}
              >
                {category.description}
              </Text>
              <View className="mt-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-black text-brand">
                    {progressPending || exercisesLoading
                      ? t('catalog.loading')
                      : seriesProgress.percent >= 100
                        ? t('catalog.completed')
                        : seriesProgress.percent > 0
                          ? `${seriesProgress.percent}%`
                          : t('catalog.notStarted')}
                  </Text>
                  <Text className="text-xs font-bold text-text-secondary">
                    {exercisesLoading
                      ? t('catalog.syncing')
                      : t('catalog.seriesProgress', {
                          count: exercises.length,
                          mastered: seriesProgress.masteredLineCount,
                          total: seriesProgress.totalLineCount,
                        })}
                  </Text>
                </View>
                <View className="mt-2">
                  <ProgressBar percent={seriesProgress.percent} />
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      )
    })

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <View className="flex-row items-center border-b-2 border-[#d7e4ef] bg-white px-4 py-3">
          <Pressable
            className="h-10 w-10 items-center justify-center rounded-[14px] border-2 border-[#d7e2ee] bg-white"
            onPress={() => router.back()}
          >
            <FontAwesome6 color="#172033" name="chevron-left" size={16} />
          </Pressable>
          <Text className="ml-3 text-2xl font-black text-text-primary">{t('catalog.selectSeries')}</Text>
        </View>

        {catalog.categories.length === 0 ? (
          <View className="flex-1 px-4 py-5">
            <EmptyState
              title={t('catalog.noSeries')}
              description={t('catalog.noSeriesDescription')}
            />
          </View>
        ) : (
          <View className="flex-1 flex-row">
            <View className="w-[96px] self-stretch border-r-2 border-[#cfe0ee] bg-[#f1f8ff]">
              <Text className="px-3 pt-3 text-left text-[11px] font-black text-text-secondary">
                {t('catalog.category')}
              </Text>
              <AppScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 6, paddingTop: 10, paddingBottom: 24 }}
              >
                {renderGroupNav()}
              </AppScrollView>
            </View>

            <AppScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 12, paddingBottom: 28, gap: 12 }}
            >
              <View className="px-1 pb-1 pt-1">
                <Text className="text-xs font-black text-text-secondary">
                  {t('catalog.currentCategory')}
                </Text>
                <Text className="mt-1 text-2xl font-black text-text-primary">
                  {selectedGroup?.group.name}
                </Text>
                <Text className="mt-2 text-sm font-bold text-text-secondary">
                  {t('catalog.seriesCount', { count: selectedGroup?.categories.length ?? 0 })}
                </Text>
              </View>

              {renderSeriesCards()}
            </AppScrollView>
          </View>
        )}
      </View>
    </SafeScreen>
  )
}
