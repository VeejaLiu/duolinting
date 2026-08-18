import { useEffect, useRef, useState } from 'react'
import type {
  CatalogExerciseSummary,
  ListeningExercise,
  StudyStore,
  ContentLocale,
} from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'
import { ensureExerciseProgress } from '../lib/progressStore'

type UseExerciseDetailOptions = {
  activeExerciseSummary?: CatalogExerciseSummary
  setStore: React.Dispatch<React.SetStateAction<StudyStore>>
  contentLocale?: ContentLocale
  authToken?: string
}

export function useExerciseDetail({
  activeExerciseSummary,
  setStore,
  contentLocale,
  authToken,
}: UseExerciseDetailOptions) {
  const exerciseCacheRef = useRef<Record<string, ListeningExercise>>({})
  const [activeExercise, setActiveExercise] = useState<ListeningExercise | undefined>()
  const [exerciseLoading, setExerciseLoading] = useState(false)
  const [exerciseLoadFailed, setExerciseLoadFailed] = useState(false)

  useEffect(() => {
    if (!activeExerciseSummary) {
      setActiveExercise(undefined)
      setExerciseLoading(false)
      setExerciseLoadFailed(false)
      return
    }

    const cacheKey = `${activeExerciseSummary.id}:${contentLocale ?? 'default'}:${authToken ?? 'anonymous'}`
    const cachedExercise = exerciseCacheRef.current[cacheKey]
    if (cachedExercise) {
      setActiveExercise(cachedExercise)
      setExerciseLoading(false)
      setExerciseLoadFailed(false)
      setStore((current) => ensureExerciseProgress(current, cachedExercise))
      return
    }

    let mounted = true
    setActiveExercise(undefined)
    setExerciseLoading(true)
    setExerciseLoadFailed(false)

    apiClient
      .getExercise(activeExerciseSummary.id, contentLocale, authToken)
      .then((exercise) => {
        if (!mounted) {
          return
        }

        exerciseCacheRef.current[cacheKey] = exercise
        setActiveExercise(exercise)
        setStore((current) => ensureExerciseProgress(current, exercise))
        setExerciseLoadFailed(false)
      })
      .catch(() => {
        if (!mounted) {
          return
        }

        setActiveExercise(undefined)
        setExerciseLoadFailed(true)
      })
      .finally(() => {
        if (mounted) {
          setExerciseLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [activeExerciseSummary, authToken, contentLocale, setStore])

  return {
    activeExercise,
    exerciseLoading,
    exerciseLoadFailed,
  }
}
