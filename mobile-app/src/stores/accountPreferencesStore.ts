import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ContentLocale, UiLocale, UserPreferences } from '@duolinting/domain'
import { create } from 'zustand'
import { apiClient } from '@/lib/apiClient'
import { defaultLanguagePreferences, isContentLocale, isUiLocale } from '@/i18n/locale'

type Patch = Partial<Pick<UserPreferences, 'uiLocale' | 'contentLocale' | 'dailyGoal'>>
type RecordValue = { uiLocale: UiLocale; contentLocale: ContentLocale; dailyGoal: number; pending: Patch }
type SyncState = 'idle' | 'syncing' | 'local' | 'synced'
type State = RecordValue & {
  userId: string | null
  ready: boolean
  syncState: SyncState
  activate: (userId: string, token: string) => Promise<void>
  update: (patch: Patch) => Promise<void>
  retry: () => Promise<void>
  refreshToken: (nextToken: string) => void
  removeAccount: (userId: string) => Promise<void>
  clear: () => void
}

const defaults = (): RecordValue => ({ ...defaultLanguagePreferences(), dailyGoal: 10, pending: {} })
const key = (userId: string) => `duolinting.mobile.user.${encodeURIComponent(userId)}.preferences.v2`
let generation = 0
let revision = 0
let token = ''
let flushPromise: Promise<boolean> | null = null
let writeQueue: Promise<void> = Promise.resolve()
let workingRecord: RecordValue | null = null

const normalize = (value: Partial<RecordValue> | null): RecordValue => {
  const fallback = defaults()
  return {
    uiLocale: isUiLocale(value?.uiLocale) ? value.uiLocale : fallback.uiLocale,
    contentLocale: isContentLocale(value?.contentLocale) ? value.contentLocale : fallback.contentLocale,
    dailyGoal: Number.isSafeInteger(value?.dailyGoal) && Number(value?.dailyGoal) >= 1 ? Number(value?.dailyGoal) : 10,
    pending: value?.pending ?? {},
  }
}

const save = (userId: string, value: RecordValue) => {
  // Serial writes keep a rapid sequence of choices in the same order on disk.
  const next = writeQueue.catch(() => undefined).then(() => AsyncStorage.setItem(key(userId), JSON.stringify(value)))
  writeQueue = next
  return next
}

const flush = async () => {
  if (flushPromise) return flushPromise
  const run = async (): Promise<boolean> => {
    const started = generation
    while (started === generation) {
      const state = useAccountPreferencesStore.getState()
      if (!state.userId || !token || !Object.keys(state.pending).length) break
      const patch = { ...state.pending }
      useAccountPreferencesStore.setState({ syncState: 'syncing' })
      try {
        await apiClient.updateUserPreferences(patch, token)
      } catch {
        if (started === generation) useAccountPreferencesStore.setState({ syncState: 'local' })
        return false
      }
      if (started !== generation) break
      const current = useAccountPreferencesStore.getState()
      const pending = { ...current.pending }
      for (const field of Object.keys(patch) as Array<keyof Patch>) {
        if (pending[field] === patch[field]) delete pending[field]
      }
      const next = { uiLocale: current.uiLocale, contentLocale: current.contentLocale, dailyGoal: current.dailyGoal, pending }
      const atRevision = revision
      try {
        await save(current.userId!, next)
        if (started === generation && atRevision === revision) {
          workingRecord = next
          useAccountPreferencesStore.setState({ pending, syncState: Object.keys(pending).length ? 'local' : 'synced' })
        }
      } catch {
        if (started === generation) useAccountPreferencesStore.setState({ syncState: 'local' })
        return false
      }
    }
    return true
  }
  flushPromise = run().finally(() => { flushPromise = null })
  return flushPromise
}

export const useAccountPreferencesStore = create<State>((set, get) => ({
  ...defaults(),
  userId: null,
  ready: false,
  syncState: 'idle',
  activate: async (userId, nextToken) => {
    const currentGeneration = ++generation
    revision = 0
    token = nextToken
    workingRecord = null
    set({ ...defaults(), userId, ready: false, syncState: 'idle' })
    let saved: RecordValue | null = null
    try {
      const raw = await AsyncStorage.getItem(key(userId))
      saved = raw ? normalize(JSON.parse(raw) as Partial<RecordValue>) : null
    } catch { /* No local copy. The cloud load can still succeed. */ }
    if (currentGeneration !== generation) return
    workingRecord = saved ?? defaults()
    set({ ...workingRecord, ready: true, syncState: Object.keys(saved?.pending ?? {}).length ? 'local' : 'idle' })
    try {
      const server = await apiClient.getUserPreferences(nextToken)
      if (currentGeneration !== generation) return
      const current = get()
      const pending = current.pending
      const merged = normalize({
        uiLocale: pending.uiLocale ?? server.uiLocale,
        contentLocale: pending.contentLocale ?? server.contentLocale,
        dailyGoal: pending.dailyGoal ?? server.dailyGoal,
        pending,
      })
      const atRevision = revision
      workingRecord = merged
      await save(userId, merged)
      if (currentGeneration !== generation) return
      if (atRevision === revision) {
        workingRecord = merged
        set({ ...merged, syncState: Object.keys(pending).length ? 'local' : 'synced' })
      }
      void flush()
    } catch {
      if (currentGeneration === generation) set({ syncState: 'local' })
    }
  },
  update: async (patch) => {
    const current = { ...get(), ...(workingRecord ?? {}) }
    if (!current.userId) return
    const atRevision = ++revision
    const next = normalize({ ...current, ...patch, pending: { ...current.pending, ...patch } })
    workingRecord = next
    await save(current.userId, next)
    if (get().userId !== current.userId) return
    if (atRevision === revision) set({ ...next, syncState: 'local' })
    void flush().then((completed) => {
      if (completed && get().userId === current.userId && Object.keys(get().pending).length) void flush()
    })
  },
  retry: async () => { await flush() },
  refreshToken: (nextToken) => { token = nextToken; void flush() },
  removeAccount: async (userId) => {
    await writeQueue.catch(() => undefined)
    await AsyncStorage.removeItem(key(userId))
  },
  clear: () => {
    generation += 1
    token = ''
    workingRecord = null
    set({ ...defaults(), userId: null, ready: false, syncState: 'idle' })
  },
}))
