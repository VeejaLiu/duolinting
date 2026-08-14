import { createEmptyStore, type StudyStore } from '@duolinting/domain'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { ApiClientError } from '@duolinting/api-client'
import { apiClient } from '@/lib/apiClient'
import { useAuthStore } from '@/stores/authStore'
import { useStudyStore } from '@/stores/studyStore'

const isUnauthorizedError = (error: unknown) =>
  error instanceof ApiClientError && error.status === 401

function useProgressSyncSaveMutation() {
  const authToken = useAuthStore((state) => state.authToken)
  const expireSession = useAuthStore((state) => state.expireSession)
  const setAccountStatus = useAuthStore((state) => state.setAccountStatus)
  const setSyncStatus = useStudyStore((state) => state.setSyncStatus)

  return useMutation({
    mutationFn: (nextStore: StudyStore) => apiClient.saveProgress(nextStore, authToken),
    onSuccess: () => {
      setSyncStatus('synced')
      setAccountStatus('account.progressSynced')
    },
    onError: (error) => {
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
  const pendingSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveMutation = useProgressSyncSaveMutation()
  const serializedStore = serializeStore(store)

  const progressQuery = useQuery({
    queryKey: ['progress', authToken],
    queryFn: () => apiClient.getProgress(authToken),
    enabled: Boolean(authToken),
  })

  useEffect(() => {
    if (!authToken) {
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
    progressQuery.data,
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
    void saveMutation.mutateAsync(store).then(() => {
      setLastSyncedStoreSnapshot(serializeStore(store))
    })
  }

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
  }, [authToken, lastSyncedStoreSnapshot, saveMutation, serializedStore, syncReady])

  return {
    flushProgressToCloud,
    progressQuery,
    saveMutation,
  }
}

export function useProgressSyncActions() {
  const authToken = useAuthStore((state) => state.authToken)
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
    void saveMutation.mutateAsync(store).then(() => {
      setLastSyncedStoreSnapshot(serializeStore(store))
    })
  }

  return {
    flushProgressToCloud,
    isSyncing: saveMutation.isPending,
  }
}
