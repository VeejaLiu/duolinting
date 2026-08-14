import AsyncStorage from '@react-native-async-storage/async-storage'
import type { StudyStore } from '@duolinting/domain'
import type { ActivityLog } from '@/stores/activityStore'

// 本地数据底座的两个存储 key，带 v1 版本号：
// 将来结构变更时换 key（v2），旧数据自然失效，不做原地迁移
const STUDY_STORE_KEY = 'duolinting.mobile.study.v1'
const ACTIVITY_LOG_KEY = 'duolinting.mobile.activity.v1'

/**
 * 容错口径：本地快照读不到（首次启动）或损坏（JSON 解析失败、存储异常）
 * 一律返回 null，让上层当作"没有本地数据"走空存档启动。
 * 坏数据不阻塞启动，也不把异常抛给 UI。
 */
const readJson = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * 写盘失败（存储已满等）只丢这一次快照，不打断学习流程；
 * 下一次变更还会再尝试写。
 */
const writeJson = async (key: string, value: unknown): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 忽略写盘异常，见上方注释
  }
}

export const progressStorage = {
  async loadStudyStore(): Promise<StudyStore | null> {
    return readJson<StudyStore>(STUDY_STORE_KEY)
  },
  async saveStudyStore(store: StudyStore): Promise<void> {
    await writeJson(STUDY_STORE_KEY, store)
  },
  async loadActivityLog(): Promise<ActivityLog | null> {
    return readJson<ActivityLog>(ACTIVITY_LOG_KEY)
  },
  async saveActivityLog(log: ActivityLog): Promise<void> {
    await writeJson(ACTIVITY_LOG_KEY, log)
  },
}
