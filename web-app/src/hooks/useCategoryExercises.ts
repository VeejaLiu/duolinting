import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogExerciseSummary, ContentLocale } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'

export function useCategoryExercises(contentLocale?: ContentLocale) {
  const [exercisesByCategory, setExercisesByCategory] = useState<
    Record<string, CatalogExerciseSummary[]>
  >({})
  const [loadingCategoryId, setLoadingCategoryId] = useState<number | null>(null)
  const cacheRef = useRef<Record<string, CatalogExerciseSummary[]>>({})

  useEffect(() => {
    cacheRef.current = {}
    setExercisesByCategory({})
  }, [contentLocale])

  const loadExercises = useCallback(async (categoryId: number) => {
    const cacheKey = `${categoryId}:${contentLocale ?? 'default'}`
    // Return from cache if available
    if (cacheRef.current[cacheKey]) {
      return cacheRef.current[cacheKey]
    }

    setLoadingCategoryId(categoryId)
    try {
      const exercises = await apiClient.getCategoryExercises(categoryId, contentLocale)
      cacheRef.current[cacheKey] = exercises
      setExercisesByCategory((prev) => ({
        ...prev,
        [categoryId]: exercises,
      }))
      return exercises
    } finally {
      setLoadingCategoryId(null)
    }
  }, [contentLocale])

  const getCachedExercises = useCallback((categoryId: number) => {
    return cacheRef.current[`${categoryId}:${contentLocale ?? 'default'}`]
  }, [contentLocale])

  return {
    exercisesByCategory,
    loadingCategoryId,
    loadExercises,
    getCachedExercises,
  }
}
