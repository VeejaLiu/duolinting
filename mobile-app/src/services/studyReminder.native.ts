import AsyncStorage from '@react-native-async-storage/async-storage'
import { isRunningInExpoGo } from 'expo'
import { Linking, Platform } from 'react-native'
import { create } from 'zustand'
import type { ReminderTime } from '@/stores/activityStore'

export type ReminderCopy = { title: string; body: string }
export type ReminderStatus = 'disabled' | 'enabled' | 'permission' | 'error'
export const useReminderStatus = create<{ status: ReminderStatus; setStatus: (status: ReminderStatus) => void }>((set) => ({
  status: 'disabled', setStatus: (status) => set({ status }),
}))
type NotificationsModule = typeof import('expo-notifications')
const markerKey = 'duolinting.mobile.reminder.v2'
const legacyKey = 'duolinting.mobile.reminder.v2-legacy-cleaned'
const unsupported = Platform.OS === 'android' && isRunningInExpoGo()
let modulePromise: Promise<NotificationsModule> | null = null
let queue: Promise<unknown> = Promise.resolve()
let version = 0
let activeOwner: string | null = null
let activeSignature = ''

const notifications = async () => {
  if (unsupported) return null
  modulePromise ??= import('expo-notifications').then((value) => {
    value.setNotificationHandler({ handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
    }) })
    return value
  })
  return modulePromise
}
const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = queue.then(operation, operation)
  queue = result.catch(() => undefined)
  return result
}
const allowed = (permission: Awaited<ReturnType<NotificationsModule['getPermissionsAsync']>>, api: NotificationsModule) =>
  permission.granted || permission.ios?.status === api.IosAuthorizationStatus.PROVISIONAL

const cancelOwned = async (api: NotificationsModule) => {
  const raw = await AsyncStorage.getItem(markerKey)
  const saved = raw ? JSON.parse(raw) as { id: string; owner: string } : null
  if (saved?.id) await api.cancelScheduledNotificationAsync(saved.id)
  await AsyncStorage.removeItem(markerKey)
  activeSignature = ''
}

export const reminderController = {
  async sync(owner: string, enabled: boolean, time: ReminderTime, copy: ReminderCopy, requestPermission = false): Promise<ReminderStatus> {
    activeOwner = owner
    const operationVersion = ++version
    return serialize(async () => {
      let api: NotificationsModule | null
      try { api = await notifications() } catch {
        useReminderStatus.getState().setStatus('error')
        return 'error'
      }
      if (!api) {
        const status = enabled ? 'error' : 'disabled'
        useReminderStatus.getState().setStatus(status)
        return status
      }
      if (activeOwner !== owner || operationVersion !== version) return 'disabled'
      try {
        // v1 used cancel-all without an identifier. Remove its task once during migration.
        if (!(await AsyncStorage.getItem(legacyKey))) {
          await api.cancelAllScheduledNotificationsAsync()
          await AsyncStorage.setItem(legacyKey, '1')
        }
        if (!enabled) {
          await cancelOwned(api)
          useReminderStatus.getState().setStatus('disabled')
          return 'disabled'
        }
        if (Platform.OS === 'android') {
          await api.setNotificationChannelAsync('daily-study', { name: copy.title, importance: api.AndroidImportance.DEFAULT })
        }
        let permission = await api.getPermissionsAsync()
        if (!allowed(permission, api) && requestPermission) permission = await api.requestPermissionsAsync()
        if (!allowed(permission, api)) {
          await cancelOwned(api)
          useReminderStatus.getState().setStatus('permission')
          return 'permission'
        }
        const signature = `${owner}:${time.hour}:${time.minute}:${copy.title}:${copy.body}`
        if (activeSignature === signature) {
          const saved = await AsyncStorage.getItem(markerKey)
          const parsed = saved ? JSON.parse(saved) as { id: string } : null
          const scheduled = await api.getAllScheduledNotificationsAsync()
          if (parsed?.id && scheduled.some((item) => item.identifier === parsed.id)) {
            useReminderStatus.getState().setStatus('enabled')
            return 'enabled'
          }
        }
        await cancelOwned(api)
        if (activeOwner !== owner || operationVersion !== version) return 'disabled'
        const id = await api.scheduleNotificationAsync({
          content: { title: copy.title, body: copy.body },
          trigger: { type: api.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute },
        })
        await AsyncStorage.setItem(markerKey, JSON.stringify({ id, owner }))
        if (activeOwner !== owner || operationVersion !== version) {
          await cancelOwned(api)
          return 'disabled'
        }
        activeSignature = signature
        useReminderStatus.getState().setStatus('enabled')
        return 'enabled'
      } catch {
        useReminderStatus.getState().setStatus('error')
        return 'error'
      }
    })
  },
  async endSession(owner: string) {
    version += 1
    activeOwner = null
    await serialize(async () => {
      try {
        const api = await notifications()
        if (api) {
          const raw = await AsyncStorage.getItem(markerKey)
          const saved = raw ? JSON.parse(raw) as { owner: string } : null
          if (saved?.owner === owner) await cancelOwned(api)
        }
      } finally { useReminderStatus.getState().setStatus('disabled') }
    })
  },
  openSystemSettings: () => Linking.openSettings(),
}
