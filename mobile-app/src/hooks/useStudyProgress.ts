import type {
  ExerciseProgress,
  LineProgress,
  ListeningExercise,
  StudyStore,
} from '@duolinting/domain'
import {
  countExerciseStats,
  createExerciseProgress,
  createLineProgress,
  ensureExerciseProgress,
  isDictationAccepted,
} from '@duolinting/domain'
import { useMemo } from 'react'
import { useActivityStore } from '@/stores/activityStore'

type UseStudyProgressOptions = {
  activeExercise?: ListeningExercise
  store: StudyStore
  setStore: (next: (current: StudyStore) => StudyStore) => void
}

export function useStudyProgress({
  activeExercise,
  store,
  setStore,
}: UseStudyProgressOptions) {
  const progress = useMemo(
    () =>
      activeExercise
        ? store.progressByExercise[activeExercise.id] ??
          createExerciseProgress(activeExercise)
        : undefined,
    [activeExercise, store.progressByExercise],
  )

  const selectedLine =
    activeExercise && progress
      ? activeExercise.lines.find((line) => line.id === progress.lastLineId) ??
        activeExercise.lines[0]
      : undefined

  const selectedLineIndex =
    activeExercise && selectedLine
      ? Math.max(
          activeExercise.lines.findIndex((line) => line.id === selectedLine.id),
          0,
        )
      : 0

  const lineProgress =
    selectedLine && progress
      ? progress.lines[selectedLine.id] ?? createLineProgress()
      : createLineProgress()

  const stats = progress
    ? countExerciseStats(progress)
    : { unclear: 0, mastered: 0, repeatCount: 0, vocabulary: 0 }
  const masteryPercent = activeExercise?.lines.length
    ? Math.round((stats.mastered / activeExercise.lines.length) * 100)
    : 0
  const acceptedAnswers = selectedLine
    ? [selectedLine.text, ...(selectedLine.answers ?? [])]
    : []
  const dictationMatches = isDictationAccepted(
    lineProgress.dictation,
    acceptedAnswers,
  )

  const updateActiveProgress = (
    updater: (progress: ExerciseProgress) => ExerciseProgress,
  ) => {
    if (!activeExercise) {
      return
    }

    setStore((current) => {
      const prepared = ensureExerciseProgress(current, activeExercise)
      return {
        ...prepared,
        activeExerciseId: activeExercise.id,
        progressByExercise: {
          ...prepared.progressByExercise,
          [activeExercise.id]: {
            ...updater(prepared.progressByExercise[activeExercise.id]),
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
  }

  const updateLineProgress = (
    lineId: string,
    updater: (line: LineProgress) => LineProgress,
  ) => {
    updateActiveProgress((current) => ({
      ...current,
      lines: {
        ...current.lines,
        [lineId]: updater(current.lines[lineId] ?? createLineProgress()),
      },
    }))
  }

  const selectLine = (lineId: string) => {
    updateActiveProgress((current) => ({
      ...current,
      lastLineId: lineId,
    }))
  }

  const moveSelectedLine = (offset: number) => {
    if (!activeExercise) {
      return
    }

    const nextLine = activeExercise.lines[selectedLineIndex + offset]
    if (nextLine) {
      selectLine(nextLine.id)
    }
  }

  const markLineMastered = (lineId: string) => {
    // mastered 是 toggle 语义：先读旧值判断方向，
    // 只有"变为已掌握"的那次才计入活动日历（recordMastered），
    // 取消掌握只记活动不加计数（计数口径见 activityStore 注释）
    const becomingMastered = !progress?.lines[lineId]?.mastered
    updateLineProgress(lineId, (current) => ({
      ...current,
      mastered: !current.mastered,
    }))

    // 无 activeExercise 时 updateLineProgress 实际未生效，不记活动；
    // 用 getState() 直调而非 hook 订阅，避免与 store 形成依赖循环
    if (activeExercise) {
      if (becomingMastered) {
        useActivityStore.getState().recordMastered()
      } else {
        useActivityStore.getState().logStudyActivity()
      }
    }
  }

  const markLineUnclear = (lineId: string) => {
    updateLineProgress(lineId, (current) => ({
      ...current,
      unclear: !current.unclear,
    }))

    if (activeExercise) {
      useActivityStore.getState().logStudyActivity()
    }
  }

  const updatePlaybackRate = (rate: number) => {
    updateActiveProgress((current) => ({
      ...current,
      playbackRate: rate,
    }))
  }

  const updateDictation = (lineId: string, dictation: string) => {
    updateLineProgress(lineId, (current) => ({
      ...current,
      dictation,
    }))

    // 听写逐字输入会高频触发，但 logStudyActivity 每天只写一次盘，开销可忽略
    if (activeExercise) {
      useActivityStore.getState().logStudyActivity()
    }
  }

  // 笔记与听写一样是行级自由文本，只覆盖 note 字段，不影响判定逻辑
  const updateNote = (lineId: string, note: string) => {
    updateLineProgress(lineId, (current) => ({
      ...current,
      note,
    }))
  }

  /**
   * 收词：把当前选中句的 keyword 收进章节生词本。
   * vocabulary 的口径是 `Record<word, context>`——key 为词本身（去重天然成立，
   * 已收过的词直接跳过不重复写），value 为收词那一刻所在句的原文，
   * 作为生词列表页展示的语境。context 以"首次收词时的句子"为准，之后不再覆盖。
   * context 参数：逐句学习阶段不传，默认取 hook 内 selectedLine（当前句）；
   * 难点复习阶段由调用方显式传入复习句原文，保证语境与实际看到的句子一致。
   */
  const addVocabulary = (word: string, context?: string) => {
    const trimmedWord = word.trim()
    const contextLine = context ?? selectedLine?.text
    if (!activeExercise || !trimmedWord || !contextLine) {
      return
    }
    if (progress?.vocabulary[trimmedWord]) {
      return
    }

    updateActiveProgress((current) => ({
      ...current,
      vocabulary: {
        ...current.vocabulary,
        [trimmedWord]: contextLine,
      },
    }))

    useActivityStore.getState().logStudyActivity()
  }

  const bumpLineRepeat = (lineId: string) => {
    updateLineProgress(lineId, (current) => ({
      ...current,
      repeatCount: current.repeatCount + 1,
    }))

    if (activeExercise) {
      useActivityStore.getState().logStudyActivity()
    }
  }

  return {
    addVocabulary,
    dictationMatches,
    lineProgress,
    markLineMastered,
    markLineUnclear,
    masteryPercent,
    moveSelectedLine,
    progress,
    selectedLine,
    selectedLineIndex,
    selectLine,
    stats,
    bumpLineRepeat,
    updateDictation,
    updateNote,
    updatePlaybackRate,
  }
}
