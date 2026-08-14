import { useMemo } from 'react'
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
} from '../lib/progressStore'
import { AUTH_TOKEN_STORAGE_KEY } from '@duolinting/app-config'
import { apiClient } from '../lib/apiClient'
import { isDictationAccepted } from '../lib/studyStages'

// 将 Date 格式化为客户端本地日期 yyyy-MM-dd（不能用 toISOString，那是 UTC 日期，
// 会与用户本地「今天」错位，导致每日活动记到错误的自然日）。
const formatLocalDay = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 静默上报一次「掌握一句」的每日活动：fire-and-forget，失败静默忽略，
// 不阻塞 UI、不提示用户；未登录（本地无 token）时直接跳过。
const reportMasteredActivity = () => {
  const authToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (!authToken) {
    return
  }

  apiClient
    .recordDailyActivity(formatLocalDay(new Date()), 1, authToken)
    .catch(() => {
      // 上报失败不影响学习流程，静默忽略
    })
}

type UseStudyProgressOptions = {
  activeExercise?: ListeningExercise
  store: StudyStore
  setStore: React.Dispatch<React.SetStateAction<StudyStore>>
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
    : { unclear: 0, mastered: 0, vocabulary: 0 }
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

  const addVocabulary = (word: string, line = selectedLine) => {
    if (!line) {
      return
    }

    updateActiveProgress((current) => ({
      ...current,
      vocabulary: {
        ...current.vocabulary,
        [word]: line.text,
      },
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
    // mastered 是 toggle：先读取当前状态，只有「从未掌握变为掌握」这一方向
    // 才静默上报每日活动；取消掌握不上报、不扣减（与 mobile 端口径一致，
    // 服务端按点下「掌握」的次数累计 streak/每日目标）。
    const becomingMastered = !(progress?.lines[lineId]?.mastered ?? false)

    updateLineProgress(lineId, (current) => ({
      ...current,
      mastered: !current.mastered,
    }))

    if (becomingMastered) {
      reportMasteredActivity()
    }
  }

  const markLineUnclear = (lineId: string) => {
    updateLineProgress(lineId, (current) => ({
      ...current,
      unclear: !current.unclear,
    }))
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
    updateActiveProgress,
    updateLineProgress,
  }
}
