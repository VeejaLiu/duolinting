import { createEmptyStore, type StudyStore } from '@duolinting/domain'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { ApiClientError } from '@duolinting/api-client'
import { apiClient } from '@/lib/apiClient'
import { useAuthStore } from '@/stores/authStore'
import { useStudyStore } from '@/stores/studyStore'
import { progressStorage } from '@/services/progressStorage'

const isUnauthorizedError = (error: unknown) =>
  error instanceof ApiClientError && error.status === 401

function useProgressSyncSaveMutation() {
  const authToken = useAuthStore((state) => state.authToken)
  const userId = useAuthStore((state) => state.authUser?.id)
  const expireSession = useAuthStore((state) => state.expireSession)
  const setAccountStatus = useAuthStore((state) => state.setAccountStatus)
  const setSyncStatus = useStudyStore((state) => state.setSyncStatus)

  return useMutation({
    mutationFn: (nextStore: StudyStore) => apiClient.saveProgress(nextStore, authToken),
    onSuccess: (_response, submittedStore) => {
      if (useAuthStore.getState().authToken !== authToken || useAuthStore.getState().authUser?.id !== userId) return
      setSyncStatus('synced')
      setAccountStatus('account.progressSynced')
      if (userId) {
        void progressStorage.saveStudyStore(String(userId), useStudyStore.getState().store, serializeStore(submittedStore)).catch(() => undefined)
      }
    },
    onError: (error) => {
      if (useAuthStore.getState().authToken !== authToken || useAuthStore.getState().authUser?.id !== userId) return
      if (isUnauthorizedError(error)) {
        setSyncStatus('local')
        void expireSession()
        return
      }

      setSyncStatus('error')
      setAccountStatus('account.cloudSaveFailed')
    },
  })
}

const serializeStore = (store: StudyStore) => JSON.stringify(store)

export function useRemoteProgressSync() {
  const authToken = useAuthStore((state) => state.authToken)
  const userId = useAuthStore((state) => state.authUser?.id)
  const hydrated = useStudyStore((state) => state.hydrated)
  const expireSession = useAuthStore((state) => state.expireSession)
  const setAccountStatus = useAuthStore((state) => state.setAccountStatus)
  const setStore = useStudyStore((state) => state.setStore)
  const setSyncReady = useStudyStore((state) => state.setSyncReady)
  const setSyncStatus = useStudyStore((state) => state.setSyncStatus)
  const setLastSyncedStoreSnapshot = useStudyStore(
    (state) => state.setLastSyncedStoreSnapshot,
  )
  const store = useStudyStore((state) => state.store)
  const syncReady = useStudyStore((state) => state.syncReady)
  const lastSyncedStoreSnapshot = useStudyStore(
    (state) => state.lastSyncedStoreSnapshot,
  )
  const skipNextSaveRef = useRef(false)
  const handledRemoteRef = useRef('')
  const pendingSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveMutation = useProgressSyncSaveMutation()
  const serializedStore = serializeStore(store)

  const progressQuery = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => apiClient.getProgress(authToken),
    enabled: Boolean(authToken && userId && hydrated),
  })

  useEffect(() => {
    if (!authToken || !userId || !hydrated) {
      setSyncReady(false)
      setSyncStatus('local')
      setAccountStatus('account.localMode')
      return
    }

    if (progressQuery.isError) {
      if (isUnauthorizedError(progressQuery.error)) {
        setSyncReady(false)
        setSyncStatus('local')
        void expireSession()
        return
      }

      setSyncStatus('error')
      setAccountStatus('account.cloudLoadFailed')
      return
    }

    if (!progressQuery.data) {
      return
    }
    const remoteVersion = `${userId}:${progressQuery.dataUpdatedAt}`
    if (handledRemoteRef.current === remoteVersion) return
    handledRemoteRef.current = remoteVersion

    // A local store that differs from its last confirmed cloud baseline is pending.
    // Keep it until it has been uploaded; an older GET must not erase offline work.
    if (serializedStore !== lastSyncedStoreSnapshot) {
      setSyncReady(true)
      setSyncStatus('pending')
      return
    }

    if (progressQuery.data.store) {
      const remoteSerializedStore = serializeStore(progressQuery.data.store)
      setLastSyncedStoreSnapshot(remoteSerializedStore)
      skipNextSaveRef.current = true
      setStore(progressQuery.data.store)
      setSyncStatus('synced')
      setAccountStatus('account.progressLoaded')
    } else {
      setLastSyncedStoreSnapshot(serializeStore(createEmptyStore()))
      setSyncStatus('synced')
      setAccountStatus('account.noProgress')
    }

    setSyncReady(true)
  }, [
    authToken,
    userId,
    hydrated,
    serializedStore,
    lastSyncedStoreSnapshot,
    progressQuery.data,
    progressQuery.dataUpdatedAt,
    progressQuery.error,
    progressQuery.isError,
    expireSession,
    setAccountStatus,
    setLastSyncedStoreSnapshot,
    setStore,
    setSyncReady,
    setSyncStatus,
  ])

  const flushProgressToCloud = () => {
    if (!authToken || !syncReady) {
      return
    }

    if (pendingSaveTimeoutRef.current) {
      clearTimeout(pendingSaveTimeoutRef.current)
      pendingSaveTimeoutRef.current = null
    }

    setSyncStatus('syncing')
    const owner = userId
    const submitted = store
    void saveMutation.mutateAsync(submitted).then(() => {
      if (useAuthStore.getState().authUser?.id === owner && useAuthStore.getState().authToken === authToken) {
        setLastSyncedStoreSnapshot(serializeStore(submitted))
      }
    }).catch(() => undefined)
  }

  useEffect(() => {
    if (!authToken || !syncReady) return
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && serializeStore(useStudyStore.getState().store) !== useStudyStore.getState().lastSyncedStoreSnapshot) {
        flushProgressToCloud()
      }
    })
    return () => listener.remove()
  }, [authToken, syncReady, userId, saveMutation])

  useEffect(() => {
    if (!authToken || !syncReady) {
      return
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }

    if (serializedStore === lastSyncedStoreSnapshot) {
      if (pendingSaveTimeoutRef.current) {
        clearTimeout(pendingSaveTimeoutRef.current)
        pendingSaveTimeoutRef.current = null
      }
      return
    }

    setSyncStatus('pending')
    pendingSaveTimeoutRef.current = setTimeout(() => {
      pendingSaveTimeoutRef.current = null
      flushProgressToCloud()
    }, 800)

    return () => {
      if (pendingSaveTimeoutRef.current) {
        clearTimeout(pendingSaveTimeoutRef.current)
        pendingSaveTimeoutRef.current = null
      }
    }
  }, [authToken, userId, lastSyncedStoreSnapshot, saveMutation, serializedStore, syncReady])

  return {
    flushProgressToCloud,
    progressQuery,
    saveMutation,
  }
}

export function useProgressSyncActions() {
  const authToken = useAuthStore((state) => state.authToken)
  const userId = useAuthStore((state) => state.authUser?.id)
  const store = useStudyStore((state) => state.store)
  const syncReady = useStudyStore((state) => state.syncReady)
  const setSyncStatus = useStudyStore((state) => state.setSyncStatus)
  const setLastSyncedStoreSnapshot = useStudyStore(
    (state) => state.setLastSyncedStoreSnapshot,
  )
  const saveMutation = useProgressSyncSaveMutation()

  const flushProgressToCloud = () => {
    if (!authToken || !syncReady) {
      return
    }

    setSyncStatus('syncing')
    const submitted = store
    void saveMutation.mutateAsync(submitted).then(() => {
      if (useAuthStore.getState().authUser?.id === userId && useAuthStore.getState().authToken === authToken) {
        setLastSyncedStoreSnapshot(serializeStore(submitted))
      }
    }).catch(() => undefined)
  }

  return {
    flushProgressToCloud,
    isSyncing: saveMutation.isPending,
  }
}
