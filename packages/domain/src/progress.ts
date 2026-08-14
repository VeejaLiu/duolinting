import type {
  CatalogExerciseSummary,
  ExerciseProgress,
  LineProgress,
  ListeningExercise,
  StudyStore,
} from './domain.js'

export const createLineProgress = (): LineProgress => ({
  unclear: false,
  mastered: false,
  repeatCount: 0,
  note: '',
  dictation: '',
})

export const createExerciseProgress = (
  exercise: ListeningExercise,
): ExerciseProgress => ({
  exerciseId: exercise.id,
  lastLineId: exercise.lines[0]?.id ?? '',
  showTranslation: true,
  hideTranscript: false,
  playbackRate: 1,
  updatedAt: new Date().toISOString(),
  lines: Object.fromEntries(
    exercise.lines.map((line) => [line.id, createLineProgress()]),
  ),
  vocabulary: {},
})

export const createInitialStore = (exercise: ListeningExercise): StudyStore => ({
  activeExerciseId: exercise.id,
  progressByExercise: {
    [exercise.id]: createExerciseProgress(exercise),
  },
})

export const createEmptyStore = (): StudyStore => ({
  activeExerciseId: '',
  progressByExercise: {},
})

export const ensureExerciseProgress = (
  store: StudyStore,
  exercise: ListeningExercise,
): StudyStore => {
  if (store.progressByExercise[exercise.id]) {
    return store
  }

  return {
    ...store,
    progressByExercise: {
      ...store.progressByExercise,
      [exercise.id]: createExerciseProgress(exercise),
    },
  }
}

export const countExerciseStats = (progress: ExerciseProgress) => {
  const lines = Object.values(progress.lines)
  return {
    unclear: lines.filter((line) => line.unclear).length,
    mastered: lines.filter((line) => line.mastered).length,
    repeatCount: lines.reduce(
      (current, line) => current + Math.max(0, line.repeatCount),
      0,
    ),
    vocabulary: Object.keys(progress.vocabulary).length,
  }
}

export type ChapterProgressSummary = {
  exerciseId: number
  masteredLineCount: number
  percent: number
  totalLineCount: number
}

export type SeriesProgressSummary = {
  masteredLineCount: number
  percent: number
  totalLineCount: number
}

export type StudyDashboardSummary = {
  startedExerciseCount: number
  completedExerciseCount: number
  masteredLineCount: number
  repeatCount: number
}

export type StudyTimelineSummary = {
  todayTouchedExerciseCount: number
  todayCompletedExerciseCount: number
  recentCompletedExerciseIds: number[]
}

export const createEmptyChapterProgress = (
  exerciseId: number,
  totalLineCount = 0,
): ChapterProgressSummary => ({
  exerciseId,
  masteredLineCount: 0,
  percent: 0,
  totalLineCount,
})

export const calculateChapterProgress = (
  exercise: Pick<CatalogExerciseSummary, 'id' | 'lineCount'>,
  store: StudyStore,
): ChapterProgressSummary => {
  const totalLineCount = Math.max(0, exercise.lineCount)
  const progress = store.progressByExercise[exercise.id]

  if (!progress || totalLineCount === 0) {
    return createEmptyChapterProgress(exercise.id, totalLineCount)
  }

  /**
   * 进度口径：
   * - lineCount 始终使用服务端给出的章节总句数作为分母。
   * - mastered 只统计用户显式确认“已掌握”的句子。
   * 这样可以避免只按本地已有记录的句子数量计算，导致完成度被高估。
   */
  const masteredLineCount = Object.values(progress.lines).filter(
    (line) => line.mastered,
  ).length

  return {
    exerciseId: exercise.id,
    masteredLineCount,
    percent: Math.round((masteredLineCount / totalLineCount) * 100),
    totalLineCount,
  }
}

export const calculateSeriesProgress = (
  exercises: Array<Pick<CatalogExerciseSummary, 'id' | 'lineCount'>>,
  store: StudyStore,
): SeriesProgressSummary => {
  const summary = exercises.reduce(
    (current, exercise) => {
      const chapter = calculateChapterProgress(exercise, store)
      return {
        masteredLineCount: current.masteredLineCount + chapter.masteredLineCount,
        totalLineCount: current.totalLineCount + chapter.totalLineCount,
      }
    },
    {
      masteredLineCount: 0,
      totalLineCount: 0,
    },
  )

  return {
    ...summary,
    percent: summary.totalLineCount
      ? Math.round((summary.masteredLineCount / summary.totalLineCount) * 100)
      : 0,
  }
}

/**
 * 首页学习概览口径：
 * - startedExerciseCount: 只要章节存在任何本地学习进度记录，就算“已开始”。
 * - completedExerciseCount: 章节掌握度达到 100% 才算“已完成”。
 * - masteredLineCount: 所有章节里显式标记 mastered 的句子总数。
 * - repeatCount: 所有章节里单句重复播放次数总和，用来反映训练强度。
 */
export const calculateStudyDashboardSummary = (
  exercises: Array<Pick<CatalogExerciseSummary, 'id' | 'lineCount'>>,
  store: StudyStore,
): StudyDashboardSummary =>
  exercises.reduce<StudyDashboardSummary>(
    (current, exercise) => {
      const chapter = calculateChapterProgress(exercise, store)
      const progress = store.progressByExercise[exercise.id]
      const repeatCount = progress
        ? Object.values(progress.lines).reduce(
            (sum, line) => sum + Math.max(0, line.repeatCount),
            0,
          )
        : 0

      return {
        startedExerciseCount:
          current.startedExerciseCount + (progress ? 1 : 0),
        completedExerciseCount:
          current.completedExerciseCount + (chapter.percent === 100 ? 1 : 0),
        masteredLineCount:
          current.masteredLineCount + chapter.masteredLineCount,
        repeatCount: current.repeatCount + repeatCount,
      }
    },
    {
      startedExerciseCount: 0,
      completedExerciseCount: 0,
      masteredLineCount: 0,
      repeatCount: 0,
    },
  )

const isSameLocalDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

/**
 * 时间维度口径：
 * - todayTouchedExerciseCount: 章节 updatedAt 落在今天，就视为“今天练过”。
 * - todayCompletedExerciseCount: 今天练过且掌握度达到 100% 的章节数。
 * - recentCompletedExerciseIds: 所有已完成章节按 updatedAt 倒序取最近若干个，用于首页“最近完成”。
 */
export const calculateStudyTimelineSummary = (
  exercises: Array<Pick<CatalogExerciseSummary, 'id' | 'lineCount'>>,
  store: StudyStore,
  now = new Date(),
): StudyTimelineSummary => {
  const recentCompleted = exercises
    .map((exercise) => {
      const chapter = calculateChapterProgress(exercise, store)
      const progress = store.progressByExercise[exercise.id]
      return {
        exerciseId: exercise.id,
        percent: chapter.percent,
        updatedAt: progress?.updatedAt ?? '',
      }
    })
    .filter((item) => item.percent === 100 && item.updatedAt)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )

  const todaySummary = exercises.reduce(
    (current, exercise) => {
      const progress = store.progressByExercise[exercise.id]
      if (!progress) {
        return current
      }

      const updatedAt = new Date(progress.updatedAt)
      if (!isSameLocalDay(updatedAt, now)) {
        return current
      }

      const chapter = calculateChapterProgress(exercise, store)
      return {
        todayTouchedExerciseCount: current.todayTouchedExerciseCount + 1,
        todayCompletedExerciseCount:
          current.todayCompletedExerciseCount + (chapter.percent === 100 ? 1 : 0),
      }
    },
    {
      todayTouchedExerciseCount: 0,
      todayCompletedExerciseCount: 0,
    },
  )

  return {
    ...todaySummary,
    recentCompletedExerciseIds: recentCompleted
      .slice(0, 3)
      .map((item) => item.exerciseId),
  }
}
