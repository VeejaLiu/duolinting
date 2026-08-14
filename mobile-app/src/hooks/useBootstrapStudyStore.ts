import type { StudyStore } from '@duolinting/domain'
import { useEffect } from 'react'
import { progressStorage } from '@/services/progressStorage'
import { syncDailyReminder } from '@/services/studyReminder'
import { useActivityStore } from '@/stores/activityStore'
import { useAuthStore } from '@/stores/authStore'
import { useStudyStore } from '@/stores/studyStore'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 本地数据底座启动钩子：
 * 1. 从磁盘读回上次的 study store 快照灌入内存（hydrate）；
 * 2. 之后 store 每次变更，500ms 防抖写盘，杀进程不丢未同步进度；
 * 3. 顺带 hydrate 活动日历（activityStore）。
 *
 * 时序口径：本地快照先到，让用户立即看到上次进度；登录后云端
 * GET /progress 返回时 useRemoteProgressSync 会按既有逻辑整体覆盖
 * 本地 store——两条数据源不冲突，云端永远是登录后的权威。
 * 覆盖后的新值同样会经这里的订阅写盘，本地快照随之更新。
 */
export function useBootstrapStudyStore() {
  const { languageReady, t } = useLanguage()
  const activityHydrated = useActivityStore((state) => state.hydrated)
  const reminderEnabled = useActivityStore((state) => state.reminderEnabled)
  const reminderTime = useActivityStore((state) => state.reminderTime)
  const authToken = useAuthStore((state) => state.authToken)
  useEffect(() => {
    let saveTimeout: ReturnType<typeof setTimeout> | null = null

    // 500ms 防抖写盘：连续多次变更只落最后一次；
    // 闭包捕获的是回调时刻的最新 store，不会写旧值
    const scheduleSave = (store: StudyStore) => {
      if (saveTimeout) {
        clearTimeout(saveTimeout)
      }

      saveTimeout = setTimeout(() => {
        saveTimeout = null
        void progressStorage.saveStudyStore(store)
      }, 500)
    }

    // 订阅先行、hydrate 在后：闸门用 state.hydrated，
    // hydrate 完成前的所有变更（包括 hydrate 自己的灌入）都不触发写盘，
    // 避免启动瞬间把初始空 store 覆盖掉磁盘上的有效快照
    const unsubscribe = useStudyStore.subscribe((state, prevState) => {
      if (state.store === prevState.store || !state.hydrated) {
        return
      }

      scheduleSave(state.store)
    })

    const bootstrap = async () => {
      const snapshot = await progressStorage.loadStudyStore()
      if (snapshot) {
        useStudyStore.getState().setStore(snapshot)
      }

      // 必须在灌入快照之后再打开写盘闸门
      useStudyStore.getState().setHydrated(true)
      await useActivityStore.getState().hydrate()
    }

    void bootstrap()

    return () => {
      unsubscribe()
      if (saveTimeout) {
        clearTimeout(saveTimeout)
      }
    }
  }, [])

  useEffect(() => {
    if (!languageReady || !activityHydrated) return
    // 语言偏好读回后再重排通知，避免启动阶段按默认中文写入系统通知。
    void syncDailyReminder(reminderEnabled, reminderTime, {
      title: t('reminder.title'),
      body: t('reminder.body'),
    })
  }, [activityHydrated, languageReady, reminderEnabled, reminderTime, t])

  // 拿到有效 token 后（登录成功或启动恢复会话）从服务端拉回活动记录合并；
  // 与 LanguageProvider 拉偏好的模式一致。gate 在 activityHydrated 之后，
  // 避免云端合并结果被本地 hydrate 覆盖。匿名时 token 为空，直接跳过。
  useEffect(() => {
    if (!activityHydrated || !authToken) return
    void useActivityStore.getState().syncFromServer(authToken)
  }, [activityHydrated, authToken])
}
