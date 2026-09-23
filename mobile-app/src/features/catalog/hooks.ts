import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ListeningExercise } from '@duolinting/domain'
import { supportsCoursePlayback } from '@duolinting/domain'
import type { CatalogExerciseSummary, CatalogResponse } from '@duolinting/domain'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'

export function useCatalogQuery() {
  const { uiLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  return useQuery<CatalogResponse>({
    // 分类与系列名称是导航界面的一部分，应跟随 uiLocale；
    // 章节标题、摘要和字幕仍由下方查询按 contentLocale 单独加载。
    // 语言必须进入 key，避免切换界面语言后复用其他语种的目录缓存。
    queryKey: ['catalog', 'directory', uiLocale, authToken],
    queryFn: () => apiClient.getCatalog(uiLocale, authToken),
    refetchOnMount: 'always',
  })
}

export function useCategoryExercisesQuery(categoryId: number) {
  const { contentLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  return useQuery<CatalogExerciseSummary[]>({
    queryKey: ['catalog', 'category-exercises', categoryId, contentLocale, authToken],
    queryFn: () => apiClient.getCategoryExercises(categoryId, contentLocale, authToken),
    enabled: categoryId > 0,
    refetchOnMount: 'always',
  })
}

export function useExerciseDetailQuery(exerciseId: number) {
  const { contentLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  const client = useQueryClient()
  const identity = `${exerciseId}:${contentLocale}:${authToken ?? ''}`
  const [pinned, setPinned] = useState<{ identity: string; course: ListeningExercise } | null>(null)
  const query = useQuery({
    queryKey: ['exercise-latest', exerciseId, contentLocale, authToken],
    queryFn: async () => {
      const course = await apiClient.getExercise(exerciseId, contentLocale, authToken)
      if (!supportsCoursePlayback(course)) throw new Error('Please update the app to play this course')
      if (course.release) client.setQueryData(['exercise-release', course.release.courseReleaseId, contentLocale, authToken], course)
      return course
    },
    enabled: exerciseId > 0,
    refetchOnMount: 'always', refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (query.data && pinned?.identity !== identity) setPinned({ identity, course: query.data })
  }, [identity, query.data, pinned?.identity])
  const course = pinned?.identity === identity ? pinned.course : query.data
  return { ...query, data: course, isError: !course && query.isError, isLoading: !course && query.isLoading,
    releaseUpdateAvailable: Boolean(course && query.data && course.release?.courseReleaseId !== query.data.release?.courseReleaseId),
    refreshRelease: () => { if (query.data) setPinned({ identity, course: query.data }) },
  }
}
