import type { StudyStore } from '@duolinting/domain'
import type { ActivityLog } from '@/stores/activityStore'

const key = (userId: string, kind: 'study' | 'activity') =>
  `duolinting.mobile.user.${encodeURIComponent(userId)}.${kind}.v2`
const deletionMarker = 'duolinting.mobile.pending-account-cleanup.v1'
const storage = () => typeof window === 'undefined' ? null : window.localStorage
const read = <T>(storageKey: string): T | null => {
  try {
    const value = storage()?.getItem(storageKey)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

export const progressStorage = {
  async loadStudyStore(userId: string) { return read<{ store: StudyStore; baseline: string }>(key(userId, 'study')) },
  async saveStudyStore(userId: string, value: StudyStore, baseline: string) {
    storage()?.setItem(key(userId, 'study'), JSON.stringify({ store: value, baseline }))
  },
  async loadActivityLog(userId: string) { return read<ActivityLog>(key(userId, 'activity')) },
  async saveActivityLog(userId: string, value: ActivityLog) {
    storage()?.setItem(key(userId, 'activity'), JSON.stringify(value))
  },
  async markAccountForCleanup(userId: string) { storage()?.setItem(deletionMarker, userId) },
  async pendingCleanupOwner() { return storage()?.getItem(deletionMarker) ?? null },
  async clearPendingCleanupMarker() { storage()?.removeItem(deletionMarker) },
  async clearLearnerData(userId: string) {
    storage()?.removeItem(key(userId, 'study'))
    storage()?.removeItem(key(userId, 'activity'))
  },
}
