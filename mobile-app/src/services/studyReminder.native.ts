import { isRunningInExpoGo } from 'expo'
import { Platform } from 'react-native'
import type { ReminderTime } from '@/stores/activityStore'

export type ReminderCopy = { title: string; body: string }
type NotificationsModule = typeof import('expo-notifications')

// 本文件是 native 实现（iOS/Android），Metro 按 .native.ts 后缀解析；
// web 端走 studyReminder.web.ts 的空实现，不会加载 expo-notifications。

const isUnsupportedAndroidExpoGo = Platform.OS === 'android' && isRunningInExpoGo()
let notificationsModulePromise: Promise<NotificationsModule> | null = null

/**
 * Android Expo Go 自 SDK 53 起移除了远程推送原生能力；直接在模块顶层导入
 * expo-notifications 也会把这项限制作为 ERROR 输出，即使这里只使用本地定时提醒。
 * 因此只在实际支持的运行环境中按需加载，防止启动日志出现与学习功能无关的报错。
 */
const getNotifications = async (): Promise<NotificationsModule | null> => {
  if (isUnsupportedAndroidExpoGo) {
    return null
  }

  notificationsModulePromise ??= import('expo-notifications').then((Notifications) => {
    // 前台收到通知时也正常弹出横幅（默认行为是静默吞掉），
    // 声音关闭，避免学习过程中被提示音打断。
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    })
    return Notifications
  })

  return notificationsModulePromise
}

/**
 * 关闭每日提醒：取消本 app 所有已调度的本地通知。
 * 目前 app 只有每日提醒这一种本地通知，全量取消最简单可靠；
 * 将来新增其他通知类型时，这里要改为按 identifier 精准取消。
 */
export const disableDailyReminder = async (): Promise<void> => {
  const Notifications = await getNotifications()
  if (!Notifications) {
    return
  }

  await Notifications.cancelAllScheduledNotificationsAsync()
}

/**
 * 开启每日提醒：先申请通知权限，再重排调度。
 * 返回是否真正调度成功（权限被拒绝时返回 false，调用方可据此回退开关 UI）。
 *
 * 调度策略：先 cancel 全部再 schedule 一条新的 DAILY 触发器——
 * 保证任何时刻系统里最多只有一条每日提醒，改时间/重复开关不会产生叠加。
 * DAILY 触发器按设备本地时区每天 hour:minute 触发，无需手动续期。
 */
export const enableDailyReminder = async (
  time: ReminderTime,
  copy: ReminderCopy,
): Promise<boolean> => {
  const Notifications = await getNotifications()
  if (!Notifications) {
    return false
  }

  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== Notifications.PermissionStatus.GRANTED) {
    return false
  }

  await Notifications.cancelAllScheduledNotificationsAsync()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.body,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
    },
  })

  return true
}

/**
 * 让系统侧的通知调度与用户设置保持一致的唯一入口。
 * 设置页开关/改时间时调用，app 启动 hydrate 完成后也会调用一次，
 * 兜底"上次调度成功后用户在系统设置里关了通知权限"等漂移场景。
 */
export const syncDailyReminder = async (
  enabled: boolean,
  time: ReminderTime,
  copy: ReminderCopy,
): Promise<boolean> => {
  if (!enabled) {
    await disableDailyReminder()
    return true
  }

  return enableDailyReminder(time, copy)
}
