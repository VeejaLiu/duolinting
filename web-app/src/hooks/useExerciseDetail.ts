import { useCallback, useEffect, useRef, useState } from 'react'
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

  const [activeExercise, setActiveExercise] = useState<ListeningExercise | undefined>()
  const [exerciseLoading, setExerciseLoading] = useState(false)
  const [exerciseLoadFailed, setExerciseLoadFailed] = useState(false)
  const [retryVersion, setRetryVersion] = useState(0)
  const loadedKey = useRef('')
  const retryExercise = useCallback(() => setRetryVersion((current) => current + 1), [])
  const exerciseId = activeExerciseSummary?.id

  useEffect(() => {
    if (!exerciseId) {
      setActiveExercise(undefined)
      setExerciseLoading(false)
      setExerciseLoadFailed(false)
      return
    }

    let mounted = true
    // Keep an already loaded course visible while retrying the same resource.
    // A different course, locale or account must never reuse that content.
    const requestKey = JSON.stringify([exerciseId, contentLocale, authToken])
    if (loadedKey.current !== requestKey) setActiveExercise(undefined)
    setExerciseLoading(true)

    apiClient
      .getExercise(exerciseId, contentLocale, authToken)
      .then((exercise) => {
        if (!mounted) {
          return
        }

        setActiveExercise(exercise)
        loadedKey.current = requestKey
        setStore((current) => ensureExerciseProgress(current, exercise))
        setExerciseLoadFailed(false)
      })
      .catch(() => {
        if (!mounted) {
          return
        }

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
  }, [exerciseId, authToken, contentLocale, retryVersion, setStore])

  return {
    activeExercise,
    exerciseLoading,
    exerciseLoadFailed,
    retryExercise,
  }
}
