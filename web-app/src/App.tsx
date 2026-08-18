import { BookOpenText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import './App.css'
import waveformImg from './assets/study-waveform.png'
import { AuthDialog } from './components/AuthDialog'
import { SettingsPage } from './components/SettingsPage'
import { CourseMap } from './components/CourseMap'
import { DifficultReviewStage } from './components/DifficultReviewStage'
import { ExtensiveStage } from './components/ExtensiveStage'
import { IntensiveStage } from './components/IntensiveStage'
import { StageRail } from './components/StageRail'
import { StudyHero } from './components/StudyHero'
import { ContributorCredits } from './components/ContributorCredits'
import {
  CatalogErrorState,
  EmptyStudyState,
  ExerciseErrorState,
  ExerciseLoadingState,
} from './components/StudyStates'
import { TopBar } from './components/TopBar'
import { ContributePage } from './components/ContributePage'
import { MobileExperiencePrompt } from './components/MobileExperiencePrompt'
import { useCatalog } from './hooks/useCatalog'
import { useCategoryExercises } from './hooks/useCategoryExercises'
import { useExerciseDetail } from './hooks/useExerciseDetail'
import { useLearnerAccount } from './hooks/useLearnerAccount'
import { useMediaPlayback } from './hooks/useMediaPlayback'
import { useStudyProgress } from './hooks/useStudyProgress'
import { apiClient as _apiClient } from './lib/apiClient'
import { useLanguage } from './i18n/LanguageProvider'
import {
  calculateChapterProgress,
  calculateSeriesProgress,
  createEmptyStore,
  type SeriesProgressSummary,
} from './lib/progressStore'
import { stageCopy, type StudyStage } from './lib/studyStages'
import type {
  CatalogExerciseSummary,
  TranscriptLine,
} from '@duolinting/shared'



function LearnerAppShell() {
  const navigate = useNavigate()
  const { contentLocale, setContentLocale, setUiLocale, t } = useLanguage()
  const { seriesId: routeSeriesId, exerciseId: routeExerciseId } = useParams<{
    seriesId?: string
    exerciseId?: string
  }>()
  const parsedRouteSeriesId = routeSeriesId ? Number(routeSeriesId) : undefined
  const parsedRouteExerciseId = routeExerciseId ? Number(routeExerciseId) : undefined
  const [searchParams, setSearchParams] = useSearchParams()
  const [studyStage, setStudyStage] = useState<StudyStage>('extensive')
  const [completedStages, setCompletedStages] = useState<
    Partial<Record<StudyStage, boolean>>
  >({})
  const [revealedLineIds, setRevealedLineIds] = useState<Record<string, true>>(
    {},
  )
  const [store, setStore] = useState(() => createEmptyStore())
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const loopingLineIdRef = useRef('')
  const {
    accountStatus,
    authLoading,
    authToken,
    authUser,
    handleAuthenticated,
    handleLogout,
  } = useLearnerAccount({
    store,
    onStoreRestore: setStore,
  })
  const {
    catalog,
    catalogLoadFailed,
  } = useCatalog(contentLocale, authToken)
  const {
    exercisesByCategory,
    loadExercises,
  } = useCategoryExercises(contentLocale, authToken)
  const seriesProgressByCategory = useMemo<Record<string, SeriesProgressSummary>>(() => {
    return Object.fromEntries(
      catalog.categories.map((category) => [
        category.id,
        calculateSeriesProgress(exercisesByCategory[category.id] ?? [], store),
      ]),
    )
  }, [catalog.categories, exercisesByCategory, store])
  const selectedSeriesId = useMemo(() => {
    if (
      Number.isInteger(parsedRouteSeriesId) &&
      catalog.categories.some((category) => category.id === parsedRouteSeriesId)
    ) {
      return parsedRouteSeriesId as number
    }

    return catalog.categories[0]?.id ?? 0
  }, [catalog.categories, parsedRouteSeriesId])

  // 懒加载当前系列下的课程列表
  const seriesExercises = exercisesByCategory[selectedSeriesId] ?? []
  const chapterProgressByExercise = useMemo(
    () =>
      Object.fromEntries(
        seriesExercises.map((exercise) => [
          exercise.id,
          calculateChapterProgress(exercise, store),
        ]),
      ),
    [seriesExercises, store],
  )

  // 根据 URL 或系列默认值确定当前课程
  const activeExerciseSummary = useMemo<CatalogExerciseSummary | undefined>(
    () => {
      if (parsedRouteExerciseId && seriesExercises.length > 0) {
        return seriesExercises.find(
          (exercise) =>
            exercise.id === parsedRouteExerciseId &&
            exercise.categoryId === selectedSeriesId,
        )
      }
      return seriesExercises[0]
    },
    [parsedRouteExerciseId, selectedSeriesId, seriesExercises],
  )
  const hasExercise = Boolean(activeExerciseSummary)

  const { activeExercise, exerciseLoading, exerciseLoadFailed } =
    useExerciseDetail({
      activeExerciseSummary,
      setStore,
      contentLocale,
      authToken,
    })

  useEffect(() => {
    if (!authToken) return
    let mounted = true
    _apiClient.getUserPreferences(authToken).then((preferences) => {
      if (!mounted) return
      setUiLocale(preferences.uiLocale)
      setContentLocale(preferences.contentLocale)
    }).catch(() => undefined)
    return () => { mounted = false }
  }, [authToken, setContentLocale, setUiLocale])

  const {
    lineProgress,
    markLineMastered,
    markLineUnclear,
    masteryPercent,
    progress,
    selectedLine,
    selectedLineIndex,
    selectLine,
    updateActiveProgress,
    updateLineProgress: _updateLineProgress,
  } = useStudyProgress({
    activeExercise,
    store,
    setStore,
  })
  const {
    currentTime,
    duration,
    isPlaying,
    playMediaRange,
    seekMedia,
    runPlayback,
    stopPlayback,
    toggleMediaPlayback,
  } = useMediaPlayback({
    mediaRef,
    playbackRate: progress?.playbackRate ?? 1,
  })

  const syncRoute = (
    nextSeriesId: number,
    nextExerciseId: number,
    nextStage: StudyStage = studyStage,
    options?: { replace?: boolean },
  ) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextStage === 'extensive') {
      nextParams.delete('stage')
    } else {
      nextParams.set('stage', nextStage)
    }

    const nextSearch = nextParams.toString()
    navigate(
      `/courses/${encodeURIComponent(nextSeriesId)}/chapters/${encodeURIComponent(nextExerciseId)}${nextSearch ? `?${nextSearch}` : ''}`,
      { replace: options?.replace ?? false },
    )
  }

  useEffect(() => {
    const stageParam = searchParams.get('stage')
    if (
      stageParam === 'intensive' ||
      stageParam === 'extensive' ||
      stageParam === 'review'
    ) {
      // 等待认证状态加载完成后再判断是否弹登录窗，
      // 避免刷新页面时 authUser 尚未恢复、误弹登录框
      if (authLoading) {
        return
      }
      if (!authUser) {
        setAccountDialogOpen(true)
        setSearchParams((current) => {
          const next = new URLSearchParams(current)
          next.delete('stage')
          return next
        }, { replace: true })
        return
      }
      setStudyStage((current) => (current === stageParam ? current : stageParam))
      return
    }

    setStudyStage((current) => (current === 'extensive' ? current : 'extensive'))
  }, [authLoading, searchParams, authUser])

  // 当选中系列改变时，懒加载该系列下的课程列表
  useEffect(() => {
    if (selectedSeriesId > 0) {
      loadExercises(selectedSeriesId)
    }
  }, [selectedSeriesId, loadExercises])

  // 课程选择弹窗需要展示所有课程的整体完成度；这里预取每个课程的章节摘要。
  // 摘要只包含章节元数据和 lineCount，不会加载逐句详情或媒体文件。
  useEffect(() => {
    for (const category of catalog.categories) {
      void loadExercises(category.id)
    }
  }, [catalog.categories, loadExercises])

  // 当系列下的课程列表加载完成后，校验路由是否有效
  useEffect(() => {
    if (seriesExercises.length === 0) {
      return
    }

    const validSeries = parsedRouteSeriesId
      ? catalog.categories.some((category) => category.id === parsedRouteSeriesId)
      : false
    const validExercise = parsedRouteExerciseId
      ? seriesExercises.some((exercise) => exercise.id === parsedRouteExerciseId)
      : false

    if (
      validSeries &&
      validExercise &&
      seriesExercises.some(
        (exercise) =>
          exercise.id === parsedRouteExerciseId && exercise.categoryId === parsedRouteSeriesId,
      )
    ) {
      return
    }

    const fallbackExercise =
      seriesExercises.find((exercise) => exercise.categoryId === parsedRouteSeriesId) ??
      seriesExercises.find((exercise) => exercise.id === parsedRouteExerciseId) ??
      seriesExercises[0]

    if (!fallbackExercise) {
      return
    }

    syncRoute(
      fallbackExercise.categoryId,
      fallbackExercise.id,
      (searchParams.get('stage') as StudyStage | null) ?? 'extensive',
      { replace: true },
    )
  }, [
    catalog.categories,
    seriesExercises,
    parsedRouteExerciseId,
    parsedRouteSeriesId,
    searchParams,
  ])

  useEffect(() => {
    if (!activeExerciseSummary) {
      return
    }

    setStore((current) =>
      current.activeExerciseId === activeExerciseSummary.id
        ? current
        : {
            ...current,
            activeExerciseId: activeExerciseSummary.id,
          },
    )
  }, [activeExerciseSummary])

  const toggleRevealLine = (lineId: string) => {
    setRevealedLineIds((current) => {
      if (!current[lineId]) {
        return {
          ...current,
          [lineId]: true,
        }
      }

      const next = { ...current }
      delete next[lineId]
      return next
    })
  }

  const toggleLineMastered = (lineId: string) => {
    markLineMastered(lineId)
  }

  const difficultLines = useMemo(
    () =>
      activeExercise && progress
        ? activeExercise.lines.filter((line) => progress.lines[line.id]?.unclear)
        : [],
    [activeExercise, progress],
  )

  const selectedReviewLine = useMemo(
    () =>
      selectedLine
        ? difficultLines.find((line) => line.id === selectedLine.id) ??
          difficultLines[0] ??
          null
        : difficultLines[0] ?? null,
    [difficultLines, selectedLine],
  )

  const resetSessionUi = () => {
    loopingLineIdRef.current = ''
    stopPlayback()
    setStudyStage('extensive')
    setCompletedStages({})
    setRevealedLineIds({})
  }

  const selectExercise = (exercise: CatalogExerciseSummary) => {
    resetSessionUi()
    setStore((current) => ({
      ...current,
      activeExerciseId: exercise.id,
    }))
    syncRoute(exercise.categoryId, exercise.id, 'extensive')
  }

  const selectSeries = async (seriesId: number) => {
    stopPlayback()

    // 先加载该系列下的课程列表
    const exercises = await loadExercises(seriesId)
    const firstExercise = exercises[0]

    if (firstExercise) {
      resetSessionUi()
      setStore((current) => ({
        ...current,
        activeExerciseId: firstExercise.id,
      }))
      syncRoute(seriesId, firstExercise.id, 'extensive')
    }
  }

  const playExtensivePass = async () => {
    if (!authUser) {
      setAccountDialogOpen(true)
      return
    }

    if (!activeExercise) {
      return
    }

    if (currentTime === 0 && activeExercise.lines[0]) {
      selectLine(activeExercise.lines[0].id)
    }

    await toggleMediaPlayback()
  }

  useEffect(() => {
    if (
      !activeExercise ||
      isPlaying ||
      duration <= 0 ||
      currentTime < duration ||
      completedStages.extensive
    ) {
      return
    }

    setCompletedStages((current) => ({ ...current, extensive: true }))
  }, [activeExercise, completedStages.extensive, currentTime, duration, isPlaying])

  const playSingleLine = async (line: TranscriptLine) => {
    if (!activeExercise) {
      return
    }

    stopPlayback()
    selectLine(line.id)
    await runPlayback(async () => {
      await playMediaRange(line.start, line.end)
    })
  }

  const moveSelectedLineAndPlay = async (offset: number) => {
    if (!activeExercise) {
      return
    }

    const nextLine = activeExercise.lines[selectedLineIndex + offset]
    if (!nextLine) {
      return
    }

    await playSingleLine(nextLine)
  }

  const moveDifficultLineAndPlay = async (offset: number) => {
    if (!selectedReviewLine) {
      return
    }

    const currentIndex = difficultLines.findIndex(
      (line) => line.id === selectedReviewLine.id,
    )
    const nextLine = difficultLines[currentIndex + offset]
    if (!nextLine) {
      return
    }

    await playSingleLine(nextLine)
  }

  useEffect(() => {
    if (
      studyStage !== 'review' ||
      difficultLines.length === 0 ||
      !selectedLine ||
      difficultLines.some((line) => line.id === selectedLine.id)
    ) {
      return
    }

    selectLine(difficultLines[0].id)
  }, [difficultLines, selectedLine, studyStage])

  const goToStage = (stage: StudyStage) => {
    if (!authUser) {
      setAccountDialogOpen(true)
      return
    }

    loopingLineIdRef.current = ''
    stopPlayback()
    setStudyStage(stage)
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (stage === 'extensive') {
          next.delete('stage')
        } else {
          next.set('stage', stage)
        }
        return next
      },
      { replace: false },
    )
    if (stage === 'intensive' && activeExercise?.lines[0]) {
      selectLine(activeExercise.lines[0].id)
      setRevealedLineIds({})
    }
    if (stage === 'review' && difficultLines[0]) {
      selectLine(difficultLines[0].id)
      setRevealedLineIds({})
    }
  }

  const stageRailItems = (Object.keys(stageCopy) as StudyStage[]).map(
    (stage) => ({
      id: stage,
      ...stageCopy[stage],
    }),
  )
  const activeSeries = useMemo(
    () => catalog.categories.find((category) => category.id === selectedSeriesId),
    [catalog.categories, selectedSeriesId],
  )
  const chapterIndex = useMemo(() => {
    if (!activeExercise) {
      return 0
    }
    const index = seriesExercises.findIndex((exercise) => exercise.id === activeExercise.id)
    return index >= 0 ? index + 1 : 0
  }, [activeExercise, seriesExercises])
  const activeChapterProgress = activeExercise
    ? chapterProgressByExercise[activeExercise.id] ??
      calculateChapterProgress(
        {
          id: activeExercise.id,
          lineCount: activeExercise.lines.length,
        },
        store,
      )
    : undefined

  return (
    <main className="app-shell">
      <TopBar
        user={authUser}
        onLogout={handleLogout}
        onOpenAccount={() => setAccountDialogOpen(true)}
      />

        <AuthDialog
          open={accountDialogOpen}
          user={authUser}
        accountStatus={accountStatus}
        onClose={() => setAccountDialogOpen(false)}
        onAuthenticated={handleAuthenticated}
        onLogout={handleLogout}
      />

      <section className="workspace">
          <CourseMap
            catalog={catalog}
            selectedSeriesId={selectedSeriesId}
            activeExerciseId={activeExercise?.id ?? ''}
            seriesExercises={seriesExercises}
            chapterProgressByExercise={chapterProgressByExercise}
            seriesProgressByCategory={seriesProgressByCategory}
            onSeriesSelect={selectSeries}
            onExerciseSelect={selectExercise}
          />

          <section className="study-pane" aria-label={t('app.studyArea.aria')}>
            {catalogLoadFailed ? (
              <CatalogErrorState />
            ) : exerciseLoadFailed ? (
              <ExerciseErrorState />
            ) : exerciseLoading ? (
              <ExerciseLoadingState />
            ) : !hasExercise || !activeExercise || !progress || !selectedLine ? (
              <EmptyStudyState />
            ) : (
              <>
                <StudyHero
                  exercise={activeExercise}
                  masteryPercent={masteryPercent}
                />

                <section className="study-chapter-banner" aria-label={t('app.chapterBanner.aria')}>
                  <div className="study-chapter-banner-icon" aria-hidden="true">
                    <BookOpenText size={18} />
                  </div>
                  <div className="study-chapter-banner-copy">
                    <p className="study-chapter-banner-kicker">{t('app.chapterBanner.kicker')}</p>
                    <strong className="study-chapter-banner-title">
                      {activeExercise.title}
                    </strong>
                  </div>
	                  <div className="study-chapter-banner-metrics">
	                    <span>
	                      {activeSeries?.name ?? t('app.chapterBanner.seriesFallback')}
	                    </span>
	                    <span>
	                      {t('app.chapterBanner.progress', { current: chapterIndex || 1, total: Math.max(seriesExercises.length, 1) })}
	                    </span>
	                  </div>
	                  <div className="study-chapter-progress" aria-hidden="true">
	                    <span style={{ width: `${activeChapterProgress?.percent ?? masteryPercent}%` }} />
	                  </div>
                </section>
                <ContributorCredits contributors={activeExercise.contributors} />

                <StageRail
                  activeStage={studyStage}
                  completedStages={completedStages}
                  stages={stageRailItems}
                  onStageSelect={goToStage}
                />

                {studyStage === 'extensive' && (
                  <ExtensiveStage
                    exercise={activeExercise}
                    mediaRef={mediaRef}
                    currentTime={currentTime}
                    duration={duration}
                    isPlaying={isPlaying}
                    waveformSrc={waveformImg}
                    onSeek={seekMedia}
                    onTogglePlayback={() => void playExtensivePass()}
                    onNextStage={() => goToStage('intensive')}
                  />
                )}

                {studyStage === 'intensive' && (
                  <IntensiveStage
                    exercise={activeExercise}
                    mediaRef={mediaRef}
                    progress={progress}
                    selectedLine={selectedLine}
                    selectedLineIndex={selectedLineIndex}
                    lineProgress={lineProgress}
                    revealedLineIds={revealedLineIds}
                    isPlaying={isPlaying}
                    onPlayLine={(line) => void playSingleLine(line)}
                    onTogglePlayback={toggleMediaPlayback}
                    onMoveLine={(offset) => void moveSelectedLineAndPlay(offset)}
                    onRevealLine={toggleRevealLine}
                    onPlaybackRateChange={(rate) =>
                      updateActiveProgress((current) => ({
                        ...current,
                        playbackRate: rate,
                      }))
                    }
                    onMarkUnclear={markLineUnclear}
                    onMarkMastered={toggleLineMastered}
                    onLineSelect={(lineId) => {
                      const line = activeExercise?.lines.find((l) => l.id === lineId)
                      if (line) void playSingleLine(line)
                    }}
                  />
                )}

                {studyStage === 'review' && (
                  <DifficultReviewStage
                    exercise={activeExercise}
                    mediaRef={mediaRef}
                    progress={progress}
                    reviewLines={difficultLines}
                    selectedLine={selectedReviewLine}
                    isPlaying={isPlaying}
                    onBackToIntensive={() => goToStage('intensive')}
                    onLineSelect={(lineId) => {
                      const line = difficultLines.find((item) => item.id === lineId)
                      if (line) void playSingleLine(line)
                    }}
                    onMarkMastered={toggleLineMastered}
                    onMarkUnclear={markLineUnclear}
                    onMoveReviewLine={(offset) => {
                      void moveDifficultLineAndPlay(offset)
                    }}
                    onPlayLine={(line) => void playSingleLine(line)}
                    onTogglePlayback={toggleMediaPlayback}
                  />
                )}
              </>
            )}
          </section>
      </section>
    </main>
  )
}

function App() {
  return (
    <>
      {/* 路由外渲染，避免用户从设置或贡献页进入时绕开移动端提示。 */}
      <MobileExperiencePrompt />
      <Routes>
        <Route path="/" element={<LearnerAppShell />} />
        <Route path="/courses/:seriesId" element={<LearnerAppShell />} />
        <Route path="/courses/:seriesId/chapters/:exerciseId" element={<LearnerAppShell />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/contribute" element={<ContributePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
