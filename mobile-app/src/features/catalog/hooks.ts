import type { CatalogExerciseSummary, CatalogResponse } from '@duolinting/domain'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'

export function useCatalogQuery() {
  const { uiLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  const userId = useAuthStore((state) => state.authUser?.id)
  return useQuery<CatalogResponse>({
    // 分类与系列名称是导航界面的一部分，应跟随 uiLocale；
    // 章节标题、摘要和字幕仍由下方查询按 contentLocale 单独加载。
    // 语言必须进入 key，避免切换界面语言后复用其他语种的目录缓存。
    queryKey: ['catalog', 'directory', uiLocale, userId],
    queryFn: () => apiClient.getCatalog(uiLocale, authToken),
    refetchOnMount: 'always',
    enabled: Boolean(userId),
  })
}

export function useCategoryExercisesQuery(categoryId: number) {
  const { contentLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  const userId = useAuthStore((state) => state.authUser?.id)
  return useQuery<CatalogExerciseSummary[]>({
    queryKey: ['catalog', 'category-exercises', categoryId, contentLocale, userId],
    queryFn: () => apiClient.getCategoryExercises(categoryId, contentLocale, authToken),
    enabled: categoryId > 0 && Boolean(userId),
    refetchOnMount: 'always',
  })
}

export function useExerciseDetailQuery(exerciseId: number) {
  const { contentLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  const userId = useAuthStore((state) => state.authUser?.id)
  return useQuery({
    queryKey: ['exercise', exerciseId, contentLocale, userId],
    queryFn: () => apiClient.getExercise(exerciseId, contentLocale, authToken),
    enabled: exerciseId > 0 && Boolean(userId),
    refetchOnMount: 'always',
  })
}
