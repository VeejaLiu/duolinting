import { useCallback, useReducer } from 'react'
import type { DraftLine } from '../lib/mediaDraftTools'
import { createSubtitleHistory, subtitleHistoryReducer, type SubtitleSnapshot } from '../lib/subtitleHistory'

export function useSubtitleHistory(initialLines: DraftLine[]) {
  const [history, dispatch] = useReducer(subtitleHistoryReducer, initialLines, createSubtitleHistory)
  const edit = useCallback((
    label: string,
    update: (snapshot: SubtitleSnapshot) => SubtitleSnapshot,
    options?: { group?: string; continuous?: boolean },
  ) => dispatch({ type: 'edit', label, update, ...options, at: Date.now() }), [])
  const reset = useCallback((lines: DraftLine[]) => dispatch({ type: 'reset', lines }), [])
  const select = useCallback((index: number) => dispatch({ type: 'select', index }), [])
  const breakGroup = useCallback(() => dispatch({ type: 'break' }), [])
  const undo = useCallback((steps = 1) => dispatch({ type: 'undo', steps }), [])
  const redo = useCallback((steps = 1) => dispatch({ type: 'redo', steps }), [])
  return { history, edit, reset, select, breakGroup, undo, redo }
}
