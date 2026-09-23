import { useEffect, useRef, useState } from 'react'
import type {
  CatalogExerciseSummary,
  ListeningExercise,
  StudyStore,
  ContentLocale,
} from '@duolinting/domain'
import { supportsCoursePlayback } from '@duolinting/domain'
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
  const pinnedRef = useRef<{ key: string; course: ListeningExercise } | null>(null)
  const forceRefreshRef = useRef(false)
  const [refreshCount, setRefreshCount] = useState(0)
  const [releaseUpdateAvailable, setReleaseUpdateAvailable] = useState(false)
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

    const identity = `${activeExerciseSummary.id}:${contentLocale ?? 'default'}:${authToken ?? 'anonymous'}`
    const releaseId = activeExerciseSummary.release?.courseReleaseId
    const cacheKey = `${identity}:release:${releaseId ?? 'legacy'}`
    if (pinnedRef.current?.key === identity && !forceRefreshRef.current) {
      setReleaseUpdateAvailable(pinnedRef.current.course.release?.courseReleaseId !== releaseId)
      return
    }
    forceRefreshRef.current = false
    setReleaseUpdateAvailable(false)
    const cachedExercise = exerciseCacheRef.current[cacheKey]
    if (cachedExercise) {
      pinnedRef.current = { key: identity, course: cachedExercise }
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
      .getExercise(activeExerciseSummary.id, contentLocale, authToken, releaseId)
      .then((exercise) => {
        if (!mounted) {
          return
        }

        if (!supportsCoursePlayback(exercise)) throw new Error('This course requires an updated player')
        pinnedRef.current = { key: identity, course: exercise }
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
  }, [activeExerciseSummary, authToken, contentLocale, setStore, refreshCount])

  return {
    activeExercise,
    exerciseLoading,
    exerciseLoadFailed,
    releaseUpdateAvailable,
    refreshRelease: () => { forceRefreshRef.current = true; setRefreshCount((value) => value + 1) },
  }
}
