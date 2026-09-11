import type { DraftLine } from './mediaDraftTools'

export const SUBTITLE_HISTORY_LIMIT = 100

export type SubtitleSnapshot = {
  lines: DraftLine[]
  // 数组下标只在所属快照内有意义；恢复时与整份字幕一同还原，避免重排后选错句子。
  activeLineIndex: number
  // 整体偏移控件的累计毫秒数与字幕同时恢复，否则撤销后再次调整会使用旧偏移。
  batchOffset: number
}

type HistoryEntry = {
  before: SubtitleSnapshot
  after: SubtitleSnapshot
  label: string
}

export type SubtitleHistory = {
  present: SubtitleSnapshot
  past: HistoryEntry[]
  future: HistoryEntry[]
  // group 标识同一句同一字段的连续输入；at 为毫秒。拖动由显式结束事件划分。
  group?: string
  at: number
}

export type SubtitleHistoryAction =
  | { type: 'reset'; lines: DraftLine[] }
  | { type: 'select'; index: number }
  | { type: 'break' }
  | { type: 'undo' | 'redo'; steps?: number }
  | {
      type: 'edit'
      update: (snapshot: SubtitleSnapshot) => SubtitleSnapshot
      label: string
      group?: string
      at: number
      continuous?: boolean
    }

export const createSubtitleHistory = (lines: DraftLine[]): SubtitleHistory => ({
  present: { lines, activeLineIndex: 0, batchOffset: 0 }, past: [], future: [], at: 0,
})

export function subtitleHistoryReducer(state: SubtitleHistory, action: SubtitleHistoryAction): SubtitleHistory {
  if (action.type === 'reset') return createSubtitleHistory(action.lines)
  if (action.type === 'break') return { ...state, group: undefined }
  if (action.type === 'select') {
    return {
      ...state, group: undefined,
      present: { ...state.present, activeLineIndex: Math.max(0, Math.min(action.index, state.present.lines.length - 1)) },
    }
  }
  if (action.type === 'undo' || action.type === 'redo') {
    let next = state
    const count = Math.min(action.steps ?? 1, action.type === 'undo' ? state.past.length : state.future.length)
    for (let step = 0; step < count; step += 1) {
      if (action.type === 'undo') {
        const entry = next.past[next.past.length - 1]
        next = { ...next, present: entry.before, past: next.past.slice(0, -1), future: [entry, ...next.future], group: undefined }
      } else {
        const entry = next.future[0]
        next = { ...next, present: entry.after, past: [...next.past, entry], future: next.future.slice(1), group: undefined }
      }
    }
    return next
  }
  if (action.type !== 'edit') return state
  const present = action.update(state.present)
  // 无变化（例如拖动结束的重复通知）不占历史、不清空重做分支。
  if (present.batchOffset === state.present.batchOffset &&
    (present.lines === state.present.lines || JSON.stringify(present.lines) === JSON.stringify(state.present.lines))) return state
  const grouped = Boolean(action.group && action.group === state.group && state.past.length &&
    (action.continuous || action.at - state.at < 800))
  const entry: HistoryEntry = {
    before: grouped ? state.past[state.past.length - 1].before : state.present,
    after: present,
    label: action.label,
  }
  // 更新函数必须不可变：未改动的字幕可以共享引用，批量操作仍作为一整步恢复。
  // 新编辑抛弃撤销后的旧分支；只保留最近 100 步，避免长时间编辑无限占用内存。
  return {
    present,
    past: [...(grouped ? state.past.slice(0, -1) : state.past), entry].slice(-SUBTITLE_HISTORY_LIMIT),
    future: [], group: action.group, at: action.at,
  }
}
