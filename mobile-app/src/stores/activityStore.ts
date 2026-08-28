import { create } from 'zustand'
import { apiClient } from '@/lib/apiClient'
import { progressStorage } from '@/services/progressStorage'
import { useAuthStore } from '@/stores/authStore'

/**
 * 每日提醒时间的持久化结构：本地时区的"几点几分"。
 * 只存小时和分钟，不存具体日期——提醒是每天重复的。
 */
export type ReminderTime = {
  hour: number
  minute: number
}

/**
 * 活动日历的持久化结构（也是 progressStorage 读写盘的 JSON 格式）：
 * - days: 以本地时区 yyyy-MM-dd 为键，记录当天学习活动；
 *   masteredCount 是"当天点下掌握的次数"。
 * - dailyGoal: 用户自定的每日掌握目标句数。
 * - reminderEnabled / reminderTime: 每日提醒通知的开关与时间。
 *   这两个字段是后加的，旧快照里没有，hydrate 时要用 ?? 给默认值
 *   做向后兼容（见下方 hydrate 实现）。
 */
export type ActivityLog = {
  days: Record<string, { masteredCount: number }>
  dailyGoal: number
  reminderEnabled: boolean
  reminderTime: ReminderTime
}

const DEFAULT_DAILY_GOAL = 10
/** 默认提醒时间：晚上 8 点，多数人下班后有空档 */
const DEFAULT_REMINDER_TIME: ReminderTime = { hour: 20, minute: 0 }

/**
 * 本地时区的 yyyy-MM-dd。
 * 手写格式化而不用 toISOString：toISOString 是 UTC 口径，
 * 对 UTC+8 的用户会把晚上 8 点后的活动记到"明天"，日历就错位了。
 */
export const formatLocalDay = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type ActivityState = ActivityLog & {
  /** 本地快照是否已从磁盘读回；读回前不写盘，避免空 state 覆盖有效快照 */
  hydrated: boolean
  hydrate: () => Promise<void>
  logStudyActivity: () => void
  recordMastered: () => void
  setDailyGoal: (value: number) => void
  setReminderEnabled: (enabled: boolean) => void
  setReminderTime: (time: ReminderTime) => void
  /** 删除账号后清空设备上的账号级活动数据，由调用方随后移除持久化快照。 */
  resetForAccountDeletion: () => void
  /**
   * 登录后从服务端拉回活动记录并合并进本地：
   * - days 按天取 max（服务端是天级累计值，本地可能有未上报的历史，
   *   取 max 保证两边都不丢）；
   * - dailyGoal 以服务端为准直接覆盖本地（账号级偏好，云端权威）。
   * 失败静默：离线时保持本地数据可用，下次拿到有效 token 再重试。
   */
  syncFromServer: (authToken: string) => Promise<void>
}

/**
 * 从 authStore 取当前 token。store 间调用用 getState() 快照取法，
 * 与 progress 相关代码一致；返回空串表示未登录，调用方据此跳过上报。
 */
const getAuthToken = () => useAuthStore.getState().authToken

/**
 * 统一写盘入口：所有 action 改完 state 后都走这里持久化完整快照。
 * 写盘闸门与 studyStore 相同——hydrate 完成前不写盘，
 * 避免启动瞬间用默认值覆盖磁盘上的有效快照。
 */
const persistActivityLog = (state: ActivityState) => {
  if (!state.hydrated) {
    return
  }

  void progressStorage.saveActivityLog({
    days: state.days,
    dailyGoal: state.dailyGoal,
    reminderEnabled: state.reminderEnabled,
    reminderTime: state.reminderTime,
  })
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  days: {},
  dailyGoal: DEFAULT_DAILY_GOAL,
  reminderEnabled: false,
  reminderTime: DEFAULT_REMINDER_TIME,
  hydrated: false,

  hydrate: async () => {
    const log = await progressStorage.loadActivityLog()
    if (log) {
      set({
        days: log.days ?? {},
        dailyGoal: log.dailyGoal ?? DEFAULT_DAILY_GOAL,
        // 向后兼容：这两个字段是激励机制版本新加的，
        // 旧版本写下的快照里没有，读回时一律兜底为默认值
        reminderEnabled: log.reminderEnabled ?? false,
        reminderTime: log.reminderTime ?? DEFAULT_REMINDER_TIME,
      })
    }
    set({ hydrated: true })
  },

  logStudyActivity: () => {
    const today = formatLocalDay(new Date())
    const current = get()
    // 今天已有记录就什么都不做：这里只负责"今天来过"，
    // 不写盘，避免听写逐字输入等高频调用反复 IO
    if (current.days[today]) {
      return
    }

    const days = { ...current.days, [today]: { masteredCount: 0 } }
    set({ days })
    persistActivityLog(get())
  },

  recordMastered: () => {
    // 计数口径：这是"今天点下掌握的次数"，不是"当前处于 mastered 的句数"。
    // markLineMastered 是 toggle，取消掌握不扣减——v1 从简，
    // 活动日历只反映学习投入，不做精确对账。
    const today = formatLocalDay(new Date())
    const current = get()
    const todayEntry = current.days[today] ?? { masteredCount: 0 }
    const days = {
      ...current.days,
      [today]: { masteredCount: todayEntry.masteredCount + 1 },
    }
    set({ days })
    persistActivityLog(get())

    // fire-and-forget 上报服务端（delta 口径：每次掌握 +1，day 为本地当天
    // yyyy-MM-dd）；未登录或网络失败都不影响本地计数，静默吞掉
    const token = getAuthToken()
    if (token) {
      void apiClient.recordDailyActivity(today, 1, token).catch(() => undefined)
    }
  },

  setDailyGoal: (value) => {
    // 目标至少为 1，取整防小数；非法输入兜底为默认值
    const dailyGoal =
      Number.isFinite(value) && value >= 1
        ? Math.floor(value)
        : DEFAULT_DAILY_GOAL
    set({ dailyGoal })
    persistActivityLog(get())

    // fire-and-forget 同步到账号偏好；未登录或失败静默，本地值仍生效
    const token = getAuthToken()
    if (token) {
      void apiClient.updateUserPreferences({ dailyGoal }, token).catch(() => undefined)
    }
  },

  setReminderEnabled: (enabled) => {
    set({ reminderEnabled: enabled })
    persistActivityLog(get())
  },

  syncFromServer: async (authToken) => {
    try {
      const [activity, preferences] = await Promise.all([
        apiClient.getDailyActivity(authToken),
        apiClient.getUserPreferences(authToken),
      ])

      const current = get()
      // days 合并策略：服务端 days 是 yyyy-MM-dd → 当天累计掌握句数，
      // 本地是同一天键下的 { masteredCount }。两边按天取 max——
      // 本地未上报过的历史（如换机前的记录）不会因服务端缺失而丢失，
      // 服务端较高的累计值（多端学习）也会吸收进来
      const mergedDays = { ...current.days }
      for (const [day, count] of Object.entries(activity.days)) {
        const localCount = mergedDays[day]?.masteredCount ?? 0
        mergedDays[day] = { masteredCount: Math.max(localCount, count) }
      }

      set({
        days: mergedDays,
        // dailyGoal 是账号级偏好，服务端为权威，直接覆盖本地
        dailyGoal:
          Number.isFinite(preferences.dailyGoal) && preferences.dailyGoal >= 1
            ? preferences.dailyGoal
            : current.dailyGoal,
      })
      persistActivityLog(get())
    } catch {
      // 离线或接口失败时保持纯本地数据，下次拿到有效 token 再重试
    }
  },

  setReminderTime: (time) => {
    // 兜底：hour 限 0-23、minute 限 0-59，非法输入回落到默认时间，
    // 避免把坏数据写进系统通知调度
    const valid =
      Number.isInteger(time.hour) &&
      time.hour >= 0 &&
      time.hour <= 23 &&
      Number.isInteger(time.minute) &&
      time.minute >= 0 &&
      time.minute <= 59
    set({ reminderTime: valid ? time : DEFAULT_REMINDER_TIME })
    persistActivityLog(get())
  },

  resetForAccountDeletion: () => {
    // 不在这里写盘：删除流程会统一移除 study/activity 两份本地快照，
    // 避免先写默认值再删除造成额外 IO；hydrated 状态保持不变。
    set({
      days: {},
      dailyGoal: DEFAULT_DAILY_GOAL,
      reminderEnabled: false,
      reminderTime: DEFAULT_REMINDER_TIME,
    })
  },
}))
