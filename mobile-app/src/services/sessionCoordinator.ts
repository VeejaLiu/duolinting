import type { QueryClient } from '@tanstack/react-query'
import { analytics, clearLegacyAnalyticsChoice } from '@/lib/analytics'
import { progressStorage } from '@/services/progressStorage'
import { reminderController } from '@/services/studyReminder'
import { useAccountPreferencesStore } from '@/stores/accountPreferencesStore'
import { useActivityStore } from '@/stores/activityStore'
import { useNavigationStore } from '@/stores/navigationStore'
import { useStudyStore } from '@/stores/studyStore'

let queryClient: QueryClient | null = null
export const registerSessionQueryClient = (client: QueryClient) => { queryClient = client }

export async function completePendingAccountCleanup() {
  const owner = await progressStorage.pendingCleanupOwner()
  if (!owner) return
  await Promise.all([
    progressStorage.clearLearnerData(owner),
    useAccountPreferencesStore.getState().removeAccount(owner),
    clearLegacyAnalyticsChoice(owner),
  ])
  await progressStorage.clearPendingCleanupMarker()
}

export async function saveSessionSnapshot(owner: string) {
  const study = useStudyStore.getState()
  const activity = useActivityStore.getState()
  const writes: Promise<unknown>[] = []
  if (study.hydrated) writes.push(progressStorage.saveStudyStore(owner, study.store, study.lastSyncedStoreSnapshot))
  if (activity.hydrated) writes.push(progressStorage.saveActivityLog(owner, {
      days: activity.days, pendingOperations: activity.pendingOperations,
      dailyGoal: activity.dailyGoal, reminderEnabled: activity.reminderEnabled,
      reminderTime: activity.reminderTime,
    }))
  await Promise.all(writes)
}

/** A session ends once. Logout keeps owner snapshots; deletion removes them. */
export async function endLearnerSession(owner: string | null, deleted: boolean, alreadySaved = false): Promise<void> {
  if (owner && !deleted) {
    if (!alreadySaved) try { await saveSessionSnapshot(owner) } catch { /* Expired sessions must still close. */ }
  }
  useStudyStore.getState().setSyncReady(false)
  useNavigationStore.getState().setPendingPath(null)
  useNavigationStore.getState().setSelectedSeriesId(null)
  useAccountPreferencesStore.getState().clear()
  // Invalidate optional telemetry and reminder operations before awaiting queries.
  const deviceShutdown = Promise.allSettled([
    analytics.suspendSession(),
    owner ? reminderController.endSession(owner) : Promise.resolve(),
  ])
  try { await queryClient?.cancelQueries() } catch { /* Continue closing the session. */ }
  queryClient?.clear()
  // A sign-out preserves the stored choice; only switching off withdraws consent.
  await deviceShutdown
  useStudyStore.getState().resetSession()
  useActivityStore.getState().resetSession()
  if (!owner) return
  if (deleted) {
    try {
      await progressStorage.markAccountForCleanup(owner)
      await completePendingAccountCleanup()
    } catch {
      // The server deletion has already succeeded. The marker is retried at startup.
    }
  }
}
