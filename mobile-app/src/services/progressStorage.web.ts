import type { StudyStore } from '@duolinting/domain'
import type { ActivityLog } from '@/stores/activityStore'

// 与 native 版共用同一组 key，web 端落在 localStorage
const STUDY_STORE_KEY = 'duolinting.mobile.study.v1'
const ACTIVITY_LOG_KEY = 'duolinting.mobile.activity.v1'

/**
 * Web builds must avoid importing `@react-native-async-storage/async-storage`
 * (or any native-only package) entirely; this file is resolved only on web,
 * so progress persistence stays browser-safe. SSR / 非浏览器环境下
 * window 不存在，所有操作降级为 no-op。
 */
const webStorage = {
  getItem(key: string) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }

    return window.localStorage.getItem(key)
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    window.localStorage.setItem(key, value)
  },
}

/**
 * 容错口径与 native 版一致：读不到或 JSON 损坏返回 null，
 * 坏数据当作"没有本地数据"，不阻塞启动。
 */
const readJson = <T>(key: string): T | null => {
  try {
    const raw = webStorage.getItem(key)
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** 写盘失败（隐私模式、配额满）只丢本次快照，不抛给上层 */
const writeJson = (key: string, value: unknown): void => {
  try {
    webStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 忽略写盘异常，见上方注释
  }
}

/** 删除账号时移除浏览器端的学习进度与活动快照；清理失败不阻塞退出流程。 */
const removeLocalData = (): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STUDY_STORE_KEY)
      window.localStorage.removeItem(ACTIVITY_LOG_KEY)
    }
  } catch {
    // 忽略本地清理异常，服务端账号删除仍然已经完成
  }
}

export const progressStorage = {
  async loadStudyStore(): Promise<StudyStore | null> {
    return readJson<StudyStore>(STUDY_STORE_KEY)
  },
  async saveStudyStore(store: StudyStore): Promise<void> {
    writeJson(STUDY_STORE_KEY, store)
  },
  async loadActivityLog(): Promise<ActivityLog | null> {
    return readJson<ActivityLog>(ACTIVITY_LOG_KEY)
  },
  async saveActivityLog(log: ActivityLog): Promise<void> {
    writeJson(ACTIVITY_LOG_KEY, log)
  },
  async clearLearnerData(): Promise<void> {
    removeLocalData()
  },
}
