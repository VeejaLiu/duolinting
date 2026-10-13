import { useEffect, useEffectEvent } from 'react'
import type { CatalogExerciseSummary, ListeningExercise } from '@duolinting/shared'
import { apiClient } from '../lib/apiClient'

export type ImporterDraft =
  | { mode: 'create'; categoryId: number }
  | { mode: 'edit'; exercise: CatalogExerciseSummary }
  | null

/** A draft is one navigation command; notices/catalog/callback updates are not new commands. */
export function useImporterDraftLoad({ draft, adminToken, onCreate, onLoad, onError }: {
  draft: ImporterDraft
  adminToken: string
  onCreate: (categoryId: number) => void
  onLoad: (exercise: ListeningExercise) => void
  onError: (error: unknown) => void
}) {
  // Read the latest role, translations and callbacks when applying the result,
  // without restarting a request whenever the parent renders a fresh callback.
  const create = useEffectEvent(onCreate)
  const apply = useEffectEvent(onLoad)
  const fail = useEffectEvent(onError)
  useEffect(() => {
    if (!draft) return
    if (draft.mode === 'create') {
      create(draft.categoryId)
      return
    }
    let cancelled = false
    void apiClient.getAdminExercise(draft.exercise.id, adminToken).then(
      (exercise) => { if (!cancelled) apply(exercise) },
      (error) => { if (!cancelled) fail(error) },
    )
    // Consuming/replacing the command or leaving the editor makes any late
    // response inert: it cannot clear the ready waveform or overwrite edits.
    return () => { cancelled = true }
  }, [draft, adminToken])
}
