import AsyncStorage from '@react-native-async-storage/async-storage'
import type { StudyStore } from '@duolinting/domain'
import type { ActivityLog } from '@/stores/activityStore'

// The unowned v1 keys are quarantined: their owner cannot be proved.
const key = (userId: string, kind: 'study' | 'activity') =>
  `duolinting.mobile.user.${encodeURIComponent(userId)}.${kind}.v2`
const deletionMarker = 'duolinting.mobile.pending-account-cleanup.v1'
const writes = new Map<string, Promise<void>>()
const write = (storageKey: string, value: unknown) => {
  const operation = (writes.get(storageKey) ?? Promise.resolve()).catch(() => undefined)
    .then(() => AsyncStorage.setItem(storageKey, JSON.stringify(value)))
  writes.set(storageKey, operation)
  return operation
}

const read = async <T>(storageKey: string): Promise<T | null> => {
  try {
    const value = await AsyncStorage.getItem(storageKey)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

export const progressStorage = {
  loadStudyStore: (userId: string) => read<{ store: StudyStore; baseline: string }>(key(userId, 'study')),
  saveStudyStore: (userId: string, value: StudyStore, baseline: string) =>
    write(key(userId, 'study'), { store: value, baseline }),
  loadActivityLog: (userId: string) => read<ActivityLog>(key(userId, 'activity')),
  saveActivityLog: (userId: string, value: ActivityLog) =>
    write(key(userId, 'activity'), value),
  async markAccountForCleanup(userId: string) {
    await AsyncStorage.setItem(deletionMarker, userId)
  },
  pendingCleanupOwner: () => AsyncStorage.getItem(deletionMarker),
  clearPendingCleanupMarker: () => AsyncStorage.removeItem(deletionMarker),
  async clearLearnerData(userId: string) {
    await Promise.all([writes.get(key(userId, 'study')), writes.get(key(userId, 'activity'))])
    await AsyncStorage.multiRemove([key(userId, 'study'), key(userId, 'activity')])
  },
}
