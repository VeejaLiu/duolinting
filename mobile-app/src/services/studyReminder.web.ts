import { create } from 'zustand'
import type { ReminderTime } from '@/stores/activityStore'

export type ReminderCopy = { title: string; body: string }
export type ReminderStatus = 'disabled' | 'enabled' | 'permission' | 'error'
export const useReminderStatus = create<{ status: ReminderStatus; setStatus: (status: ReminderStatus) => void }>((set) => ({
  status: 'disabled', setStatus: (status) => set({ status }),
}))
export const reminderController = {
  async sync(_owner: string, _enabled: boolean, _time: ReminderTime, _copy: ReminderCopy, _requestPermission = false): Promise<ReminderStatus> { return 'disabled' },
  async endSession(_owner: string) {},
  async openSystemSettings() {},
}
