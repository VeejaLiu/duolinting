import type { CatalogExerciseSummary, CatalogResponse } from '@duolinting/domain'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { useLanguage } from '@/i18n/LanguageProvider'

export function useCatalogQuery() {
  const { contentLocale } = useLanguage()
  return useQuery<CatalogResponse>({
    // 内容语言是响应内容的一部分，必须进入 key；否则 React Query 会在
    // 切换语言后把缓存中的中文标题/字幕当作目标语言数据直接复用。
    queryKey: ['catalog', contentLocale],
    queryFn: () => apiClient.getCatalog(contentLocale),
    refetchOnMount: 'always',
  })
}

export function useCategoryExercisesQuery(categoryId: number) {
  const { contentLocale } = useLanguage()
  return useQuery<CatalogExerciseSummary[]>({
    queryKey: ['catalog', 'category-exercises', categoryId, contentLocale],
    queryFn: () => apiClient.getCategoryExercises(categoryId, contentLocale),
    enabled: categoryId > 0,
    refetchOnMount: 'always',
  })
}

export function useExerciseDetailQuery(exerciseId: number) {
  const { contentLocale } = useLanguage()
  return useQuery({
    queryKey: ['exercise', exerciseId, contentLocale],
    queryFn: () => apiClient.getExercise(exerciseId, contentLocale),
    enabled: exerciseId > 0,
  })
}
