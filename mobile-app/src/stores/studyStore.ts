import type { StudyStore } from '@duolinting/domain'
import { createEmptyStore } from '@duolinting/domain'
import { create } from 'zustand'

type StudyUiState = {
  store: StudyStore
  /**
   * 本地快照是否已从磁盘 hydrate 完成。
   * 写盘订阅以此为闸门：hydrate 完成前禁止写盘，
   * 避免启动瞬间把初始空 store 覆盖掉磁盘上的有效快照。
   * 注意 resetStore 不重置它——退出登录清空后的空 store 也要写盘，
   * 与"退出登录清空本地"语义一致。
   */
  hydrated: boolean
  revealedLineIds: Record<string, true>
  syncReady: boolean
  syncStatus: 'idle' | 'local' | 'pending' | 'syncing' | 'synced' | 'error'
  /**
   * 最近一次已经和云端确认一致的学习存档快照。
   * 这里存序列化字符串而不是对象引用，是为了让自动同步和手动同步
   * 共用同一份“已同步基线”，避免两个入口各自判断导致重复上传。
   */
  lastSyncedStoreSnapshot: string
  setStore: (next:
    | StudyStore
    | ((current: StudyStore) => StudyStore)) => void
  setRevealed: (lineId: string) => void
  toggleRevealed: (lineId: string) => void
  resetRevealed: () => void
  setSyncReady: (value: boolean) => void
  setSyncStatus: (value: StudyUiState['syncStatus']) => void
  setLastSyncedStoreSnapshot: (value: string) => void
  setHydrated: (value: boolean) => void
  resetStore: () => void
}

export const useStudyStore = create<StudyUiState>((set) => ({
  store: createEmptyStore(),
  hydrated: false,
  revealedLineIds: {},
  syncReady: false,
  syncStatus: 'idle',
  lastSyncedStoreSnapshot: JSON.stringify(createEmptyStore()),
  setStore: (next) =>
    set((state) => ({
      store: typeof next === 'function' ? next(state.store) : next,
    })),
  setRevealed: (lineId) =>
    set((state) => ({
      revealedLineIds: {
        ...state.revealedLineIds,
        [lineId]: true,
      },
    })),
  toggleRevealed: (lineId) =>
    set((state) => {
      const { [lineId]: currentLine, ...nextRevealedLineIds } =
        state.revealedLineIds

      if (currentLine) {
        return { revealedLineIds: nextRevealedLineIds }
      }

      return {
        revealedLineIds: {
          ...state.revealedLineIds,
          [lineId]: true,
        },
      }
    }),
  resetRevealed: () => set({ revealedLineIds: {} }),
  setSyncReady: (value) => set({ syncReady: value }),
  setSyncStatus: (value) => set({ syncStatus: value }),
  setLastSyncedStoreSnapshot: (value) => set({ lastSyncedStoreSnapshot: value }),
  setHydrated: (value) => set({ hydrated: value }),
  // 退出登录时全量重置学习存档（重置后的空 store 会照常写盘，
  // 即"退出登录清空本地快照"）；hydrated 保持 true 不关写盘闸门。
  // 注意不清 activityStore：活动日历是设备本地数据，不随账号退出清空
  resetStore: () =>
    set({
      store: createEmptyStore(),
      revealedLineIds: {},
      syncReady: false,
      syncStatus: 'idle',
      lastSyncedStoreSnapshot: JSON.stringify(createEmptyStore()),
    }),
}))
