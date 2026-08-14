import type { ReminderTime } from '@/stores/activityStore'

export type ReminderCopy = { title: string; body: string }

/*
 * Web 空实现：expo-notifications 的本地通知调度仅 native 可用，
 * 且 web 上只要 import 该包就会触发 "push token listener not supported" 警告，
 * 所以 web 端走这个完全不引用 expo-notifications 的 stub（Metro 按 .web.ts 解析）。
 * 设置页的提醒设置入口在 web 上整体隐藏，这些方法正常不会被触达。
 */

export const disableDailyReminder = async (): Promise<void> => {}

export const enableDailyReminder = async (
  _time: ReminderTime,
  _copy: ReminderCopy,
): Promise<boolean> => false

export const syncDailyReminder = async (
  _enabled: boolean,
  _time: ReminderTime,
  _copy: ReminderCopy,
): Promise<boolean> => true
