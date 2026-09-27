import type { StudyStore } from '@duolinting/domain'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { progressStorage } from '@/services/progressStorage'
import { useAccountPreferencesStore } from '@/stores/accountPreferencesStore'
import { useActivityStore } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'
import { useStudyStore } from '@/stores/studyStore'

/** Load and save only the authenticated account's snapshots. */
export function useBootstrapStudyStore() {
  const userId = useAuthStore((state) => state.authUser?.id)
  const token = useAuthStore((state) => state.authToken)
  const activityHydrated = useActivityStore((state) => state.hydrated)
  const preferencesReady = useAccountPreferencesStore((state) => state.ready)
  const dailyGoal = useAccountPreferencesStore((state) => state.dailyGoal)

  useEffect(() => {
    if (!userId || !token) return
    const owner = String(userId)
    let active = true
    let saveTimeout: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useStudyStore.subscribe((state, previous) => {
      if (!active || state.store === previous.store || !state.hydrated) return
      if (saveTimeout) clearTimeout(saveTimeout)
      const snapshot: StudyStore = state.store
      saveTimeout = setTimeout(() => {
        saveTimeout = null
        if (active && String(useAuthStore.getState().authUser?.id) === owner) {
          void progressStorage.saveStudyStore(owner, snapshot, useStudyStore.getState().lastSyncedStoreSnapshot).catch(() => undefined)
        }
      }, 500)
    })
    const bootstrap = async () => {
      const snapshot = await progressStorage.loadStudyStore(owner)
      if (!active || String(useAuthStore.getState().authUser?.id) !== owner) return
      if (snapshot?.store) {
        useStudyStore.getState().setStore(snapshot.store)
        useStudyStore.getState().setLastSyncedStoreSnapshot(snapshot.baseline)
      }
      useStudyStore.getState().setHydrated(true)
      await Promise.all([
        useActivityStore.getState().hydrate(owner),
        useAccountPreferencesStore.getState().activate(owner, token),
      ])
    }
    void bootstrap()
    return () => {
      active = false
      unsubscribe()
      if (saveTimeout) clearTimeout(saveTimeout)
      useStudyStore.getState().resetSession()
      useActivityStore.getState().resetSession()
      useAccountPreferencesStore.getState().clear()
    }
  }, [userId])

  useEffect(() => {
    if (token && userId && useAccountPreferencesStore.getState().userId === String(userId)) {
      useAccountPreferencesStore.getState().refreshToken(token)
    }
  }, [token, userId])

  useEffect(() => {
    if (!userId) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void useAccountPreferencesStore.getState().retry()
        void useActivityStore.getState().syncPendingActivity()
      }
    })
    return () => subscription.remove()
  }, [userId])

  useEffect(() => {
    if (!userId || !token || !activityHydrated) return
    void useActivityStore.getState().syncFromServer(token, String(userId))
  }, [activityHydrated, token, userId])

  useEffect(() => {
    if (preferencesReady && userId) {
      useActivityStore.setState({ dailyGoal })
    }
  }, [dailyGoal, preferencesReady, userId])
}
