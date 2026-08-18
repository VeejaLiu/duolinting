import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import {
  createLineProgress,
  ensureExerciseProgress,
  isDictationAccepted,
  type StudyStage,
  type TranscriptLine,
} from '@duolinting/domain'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { EmptyState } from '@/components/foundation/EmptyState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { Spinner } from '@/components/foundation/Spinner'
import { useExerciseDetailQuery } from '@/features/catalog/hooks'
import { useAcceptedAnswerFeedbackMutation } from '@/features/feedback/hooks'
import { useExercisePlayback } from '@/hooks/useExercisePlayback'
import { useStudyProgress } from '@/hooks/useStudyProgress'
import { useNavigationStore } from '@/stores/navigationStore'
import { useStudyStore } from '@/stores/studyStore'
import { ExtensiveStagePanel } from './components/ExtensiveStagePanel'
import { IntensiveStagePanel } from './components/IntensiveStagePanel'
import { useLanguage } from '@/i18n/LanguageProvider'
import { StudyHeader } from './components/StudyHeader'
import { StudyStageTabs } from './components/StudyStageTabs'
import { ContributorCredits } from './components/ContributorCredits'

const formatClock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

// 倍速循环档位：1x 是基准，1.25x/1.5x 是常用提速档（泛听熟悉内容），
// 0.75x 放在最后用于慢速精听难句；按点击顺序让最常用的倍率先出现
const PLAYBACK_RATE_CYCLE = [1, 1.25, 1.5, 0.75]

export function StudyScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const { height: viewportHeight } = useWindowDimensions()
  const { exerciseId, stage: stageParam } = useLocalSearchParams<{
    exerciseId: string
    stage?: string
  }>()
  const numericExerciseId = Number(exerciseId)
  const { data: exercise, isLoading, isError, error } =
    useExerciseDetailQuery(numericExerciseId)
  const store = useStudyStore((state) => state.store)
  const setStore = useStudyStore((state) => state.setStore)
  const revealedLineIds = useStudyStore((state) => state.revealedLineIds)
  const setRevealed = useStudyStore((state) => state.setRevealed)
  const toggleRevealed = useStudyStore((state) => state.toggleRevealed)
  const resetRevealed = useStudyStore((state) => state.resetRevealed)
  const setSelectedSeriesId = useNavigationStore(
    (state) => state.setSelectedSeriesId,
  )
  // 支持通过 query 参数指定初始阶段（目前只有首页"今日复习"卡会带
  // ?stage=review 直达难点复习）；非法值一律忽略，回落到默认的泛听阶段
  const [stage, setStage] = useState<StudyStage>(() =>
    stageParam === 'review' ? 'review' : 'extensive',
  )
  const [selectedReviewLineId, setSelectedReviewLineId] = useState<string>('')
  const compactStudyLayout = viewportHeight < 780

  useEffect(() => {
    if (!exercise) {
      return
    }

    setStore((current) => ensureExerciseProgress(current, exercise))
    resetRevealed()
    setSelectedReviewLineId('')
    setSelectedSeriesId(exercise.categoryId)
  }, [exercise, resetRevealed, setSelectedSeriesId, setStore])

  const {
    addVocabulary,
    bumpLineRepeat,
    dictationMatches,
    markLineMastered,
    markLineUnclear,
    progress,
    selectedLine,
    selectedLineIndex,
    selectLine,
    updateDictation,
    updateNote,
    updatePlaybackRate,
  } = useStudyProgress({
    activeExercise: exercise,
    store,
    setStore,
  })
  const acceptedAnswerFeedbackMutation = useAcceptedAnswerFeedbackMutation()
  const reviewLines = exercise
    ? exercise.lines.filter((line) => progress?.lines[line.id]?.unclear)
    : []
  const selectedReviewLine =
    reviewLines.find((line) => line.id === selectedReviewLineId) ??
    reviewLines[0]
  const selectedReviewIndex = selectedReviewLine
    ? reviewLines.findIndex((line) => line.id === selectedReviewLine.id)
    : -1
  const {
    activeLineId,
    currentTime,
    duration,
    isPlaying,
    isPreparingPlayback,
    pause,
    playLine,
    seekTo,
    togglePlayAll,
    videoPlayer,
  } = useExercisePlayback({
    exercise,
    playbackRate: progress?.playbackRate ?? 1,
  })

  useEffect(() => {
    if (stage !== 'review') {
      return
    }

    if (reviewLines.length === 0) {
      setSelectedReviewLineId('')
      return
    }

    if (
      !selectedReviewLineId ||
      !reviewLines.some((line) => line.id === selectedReviewLineId)
    ) {
      setSelectedReviewLineId(reviewLines[0].id)
    }
  }, [reviewLines, selectedReviewLineId, stage])

  // 反馈 mutation 的状态是全局单例，切句或改听写文本后必须 reset，
  // 否则新句子会错误沿用上一句的「已提交 / 报错」状态
  const activePanelLineId =
    stage === 'review' ? selectedReviewLine?.id : selectedLine?.id
  const activePanelDictation = activePanelLineId
    ? progress?.lines[activePanelLineId]?.dictation
    : undefined
  const resetAcceptedAnswerFeedback = acceptedAnswerFeedbackMutation.reset
  useEffect(() => {
    resetAcceptedAnswerFeedback()
  }, [activePanelLineId, activePanelDictation, resetAcceptedAnswerFeedback])

  if (isLoading) {
    return (
      <SafeScreen>
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </SafeScreen>
    )
  }

  if (isError || !exercise || !progress || !selectedLine) {
    return (
      <SafeScreen>
        <View className="flex-1 px-4 py-5">
          <ErrorState
            message={
              t('study.loadFailed')
            }
          />
        </View>
      </SafeScreen>
    )
  }

  // ===== 统一「当前列表 + 选中句」语境 =====
  // 逐句学习（intensive）与难点复习（review）共用同一个 IntensiveStagePanel，
  // 差异只在三处：① 列表来源（全句 exercise.lines vs 难点句 reviewLines）；
  // ② 选中态存储（useStudyProgress 的 selectedLine/selectLine vs 本地
  // selectedReviewLineId）；③ 收词上下文（复习句要把句子原文作为生词
  // context）。这些差异在本区块一次性表达，下方只渲染一次面板。
  const isReviewStage = stage === 'review'
  const activeLines = isReviewStage ? reviewLines : exercise.lines
  const activeLine = isReviewStage ? selectedReviewLine : selectedLine
  const activeLineIndex = isReviewStage
    ? selectedReviewIndex
    : selectedLineIndex

  const playLineOnce = (line: TranscriptLine) => {
    bumpLineRepeat(line.id)
    void playLine(line)
  }

  // 选中并播放某句：按 stage 写入对应的选中态存储（见上方语境说明）
  const playActiveLine = (line: TranscriptLine) => {
    if (isReviewStage) {
      setSelectedReviewLineId(line.id)
    } else {
      selectLine(line.id)
    }
    playLineOnce(line)
  }

  const moveActiveLineAndPlay = (offset: number) => {
    // 复习列表为空时 selectedReviewIndex 为 -1，此时不允许移动
    if (activeLineIndex < 0) {
      return
    }

    const nextLine = activeLines[activeLineIndex + offset]
    if (nextLine) {
      playActiveLine(nextLine)
    }
  }

  // 在固定档位里循环；当前值不在档位表时（历史遗留值）indexOf 得 -1，
  // (index + 1) % len 恰好回到基准 1x
  const handleCyclePlaybackRate = () => {
    const current = progress.playbackRate ?? 1
    const currentIndex = PLAYBACK_RATE_CYCLE.indexOf(current)
    const next =
      PLAYBACK_RATE_CYCLE[(currentIndex + 1) % PLAYBACK_RATE_CYCLE.length]
    updatePlaybackRate(next)
  }

  // 逐句 / 复习共用同一个 mutation，提交时由下方 linePanelProps 组装的
  // 闭包带上当前选中句的 lineId
  const handleSubmitAcceptedAnswerFeedback = async (
    lineId: string,
    answer: string,
  ) => {
    await acceptedAnswerFeedbackMutation.mutateAsync({
      exerciseId: exercise.id,
      lineId,
      submittedAnswer: answer,
    })
  }

  const feedbackSubmitted = acceptedAnswerFeedbackMutation.isSuccess
  const feedbackErrorMessage = acceptedAnswerFeedbackMutation.isError
    ? t('study.submitFailed')
    : undefined

  // useStudyProgress 返回的 dictationMatches 只针对 selectedLine（逐句学习），
  // 难点复习面板选中的是 selectedReviewLine，需要按同一口径单独计算：
  // accepted answers = 原句 text + 额外 answers，归一化后精确比对
  const reviewLineProgress = selectedReviewLine
    ? (progress.lines[selectedReviewLine.id] ?? createLineProgress())
    : undefined
  const reviewDictationMatches = selectedReviewLine
    ? isDictationAccepted(reviewLineProgress?.dictation ?? '', [
        selectedReviewLine.text,
        ...(selectedReviewLine.answers ?? []),
      ])
    : false

  // 面板 props 单点组装：stage 相关差异全部在这里表达——
  // - dictationMatches：逐句用 useStudyProgress 算好的值，复习用上方
  //   同口径单独计算的 reviewDictationMatches；
  // - lines/listTitle/selectedLineNumber：复习展示难点句子集，序号取
  //   其在难点列表中的位置；逐句展示全句，序号走面板默认（index+1）；
  // - onAddVocabulary：复习句收词带上句子原文作为生词 context，逐句不带；
  // - onSubmitAcceptedAnswerFeedback：闭包绑定当前选中句的 lineId。
  // activeLine 为空只会发生在复习阶段没有难点句时，由下方 EmptyState 兜底。
  const linePanelProps = activeLine
    ? {
        activeLineId,
        currentTime,
        dictationMatches: isReviewStage
          ? reviewDictationMatches
          : dictationMatches,
        exercise,
        feedbackErrorMessage,
        feedbackSubmitted,
        formatClock,
        isPreparingPlayback,
        isPlaying,
        lineProgress: progress.lines[activeLine.id] ?? createLineProgress(),
        lines: activeLines,
        listTitle: isReviewStage ? t('study.difficultSentences') : t('study.chapterSentences'),
        onAddVocabulary: isReviewStage
          ? (word: string) => addVocabulary(word, activeLine.text)
          : (word: string) => addVocabulary(word),
        onCyclePlaybackRate: handleCyclePlaybackRate,
        onDictationChange: updateDictation,
        onMarkLineMastered: markLineMastered,
        onMarkLineUnclear: markLineUnclear,
        onMoveSelectedLine: moveActiveLineAndPlay,
        onNoteChange: updateNote,
        onPause: pause,
        onPlayLine: () => playLineOnce(activeLine),
        onRevealLine: setRevealed,
        onSelectLine: playActiveLine,
        onSubmitAcceptedAnswerFeedback: (answer: string) =>
          handleSubmitAcceptedAnswerFeedback(activeLine.id, answer),
        onToggleRevealLine: toggleRevealed,
        playbackRate: progress.playbackRate ?? 1,
        progress,
        revealedLineIds,
        selectedLine: activeLine,
        selectedLineIndex: activeLineIndex,
        selectedLineNumber: isReviewStage ? activeLineIndex + 1 : undefined,
        videoPlayer,
      }
    : null

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <StudyHeader
          compact={compactStudyLayout}
          title={exercise.title}
          onBack={() => {
            // 从生词页/复习卡等页面进入时历史栈里有上一页，直接返回；
            // 直接输入 URL 进入（无历史）时兜底回首页
            if (router.canGoBack()) {
              router.back()
            } else {
              router.replace('/(tabs)' as '/(tabs)')
            }
          }}
        />
        <ContributorCredits contributors={exercise.contributors} />

        {stage === 'intensive' || stage === 'review' ? (
          <AppScrollView
            className="flex-1"
            // 精听既保留正常状态下的上下布局，也让听写、笔记、答案反馈中的
            // 焦点输入框在键盘弹出时由应用级容器平滑滚入可视区域。
            contentContainerStyle={{
              flexGrow: 1,
              gap: compactStudyLayout ? 8 : 12,
              paddingBottom: compactStudyLayout ? 8 : 12,
              paddingHorizontal: 12,
              paddingTop: compactStudyLayout ? 8 : 12,
            }}
            showsVerticalScrollIndicator={false}
          >
            <StudyStageTabs
              compact={compactStudyLayout}
              stage={stage}
              onStageChange={setStage}
            />
            {linePanelProps ? (
              <IntensiveStagePanel {...linePanelProps} />
            ) : (
              // 只有复习阶段没有难点句时 activeLine 为空，走空态
              <EmptyState
                title={t('study.noDifficult')}
                description={t('study.noDifficultDescription')}
              />
            )}
          </AppScrollView>
        ) : (
          <AppScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 28 }}
          >
            <StudyStageTabs stage={stage} onStageChange={setStage} />

            <ExtensiveStagePanel
              currentTime={currentTime}
              duration={duration}
              exercise={exercise}
              formatClock={formatClock}
              isPlaying={isPlaying}
              onSeek={(seconds) => void seekTo(seconds)}
              onTogglePlayback={togglePlayAll}
              videoPlayer={videoPlayer}
            />
          </AppScrollView>
        )}
      </View>
    </SafeScreen>
  )
}
