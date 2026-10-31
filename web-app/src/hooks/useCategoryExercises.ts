import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogExerciseSummary, ContentLocale } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'

export function useCategoryExercises(contentLocale?: ContentLocale, authToken?: string) {
  const [exercisesByCategory, setExercisesByCategory] = useState<Record<string, CatalogExerciseSummary[]>>({})
  const [loadingCategoryIds, setLoadingCategoryIds] = useState<Record<string, true>>({})
  const [failedCategoryIds, setFailedCategoryIds] = useState<Record<string, true>>({})
  const cacheRef = useRef<Record<string, CatalogExerciseSummary[]>>({})
  const pendingRef = useRef(new Map<number, Promise<CatalogExerciseSummary[] | undefined>>())
  const generationRef = useRef(0)

  useEffect(() => {
    // Locale and account are part of the resource identity. Reject late responses
    // from the previous identity instead of presenting them as current chapters.
    generationRef.current += 1
    cacheRef.current = {}
    pendingRef.current.clear()
    setExercisesByCategory({})
    setLoadingCategoryIds({})
    setFailedCategoryIds({})
    return () => { generationRef.current += 1 }
  }, [authToken, contentLocale])

  const loadExercises = useCallback((categoryId: number): Promise<CatalogExerciseSummary[] | undefined> => {
    if (cacheRef.current[categoryId]) return Promise.resolve(cacheRef.current[categoryId])
    const pending = pendingRef.current.get(categoryId)
    if (pending) return pending
    const generation = generationRef.current
    setLoadingCategoryIds((current) => ({ ...current, [categoryId]: true }))
    const request = apiClient.getCategoryExercises(categoryId, contentLocale, authToken)
      .then((exercises) => {
        if (generation !== generationRef.current) return undefined
        cacheRef.current[categoryId] = exercises
        setExercisesByCategory((current) => ({ ...current, [categoryId]: exercises }))
        setFailedCategoryIds((current) => {
          const next = { ...current }; delete next[categoryId]; return next
        })
        return exercises
      })
      .catch(() => {
        // Effects and series selection share this method; represent failure in
        // state and resolve safely so prefetches cannot create unhandled errors.
        if (generation === generationRef.current) {
          setFailedCategoryIds((current) => ({ ...current, [categoryId]: true }))
        }
        return undefined
      })
      .finally(() => {
        if (generation !== generationRef.current) return
        pendingRef.current.delete(categoryId)
        setLoadingCategoryIds((current) => {
          const next = { ...current }; delete next[categoryId]; return next
        })
      })
    pendingRef.current.set(categoryId, request)
    return request
  }, [authToken, contentLocale])

  const getCachedExercises = useCallback((categoryId: number) => cacheRef.current[categoryId], [])
  return { exercisesByCategory, loadingCategoryIds, failedCategoryIds, loadExercises, getCachedExercises }
}
