import { BookOpen, Check, ChevronDown, Layers3, X } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type {
  CatalogExerciseSummary,
  ExerciseCategory,
  MaterialCategory,
} from '@duolinting/shared'
import { resolveApiUrl } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'
import type {
  ChapterProgressSummary,
  SeriesProgressSummary,
} from '../lib/progressStore'

const emptySeriesProgress: SeriesProgressSummary = {
  masteredLineCount: 0,
  percent: 0,
  totalLineCount: 0,
}
const CHAPTER_PROGRESS_CIRCUMFERENCE = 113

type CourseMapProps = {
  catalog: {
    categoryGroups: MaterialCategory[]
    categories: ExerciseCategory[]
  }
  selectedSeriesId: number
  activeExerciseId: number | ''
  seriesExercises: CatalogExerciseSummary[]
  chapterProgressByExercise: Record<string, ChapterProgressSummary>
  seriesProgressByCategory: Record<string, SeriesProgressSummary>
  onSeriesSelect: (seriesId: number) => void
  onExerciseSelect: (exercise: CatalogExerciseSummary) => void
}

export function CourseMap({
  catalog,
  selectedSeriesId,
  activeExerciseId,
  seriesExercises,
  chapterProgressByExercise,
  seriesProgressByCategory,
  onSeriesSelect,
  onExerciseSelect,
}: CourseMapProps) {
  const { t } = useLanguage()
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false)

  const visibleCategories = catalog.categories

  const visibleGroups = useMemo(
    () =>
      catalog.categoryGroups.filter((group) =>
        visibleCategories.some((series) => series.groupId === group.id),
      ),
    [catalog.categoryGroups, visibleCategories],
  )

  const selectedSeries =
    visibleCategories.find((series) => series.id === selectedSeriesId) ??
    visibleCategories[0]
  const [activeGroupId, setActiveGroupId] = useState<number>(
    selectedSeries?.groupId ?? visibleGroups[0]?.id ?? -1,
  )

  useEffect(() => {
    // Reset active group only when current selection is not "全部" and the group no longer exists
    if (activeGroupId !== -1 && !visibleGroups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(-1)
    }
  }, [activeGroupId, visibleGroups])

  const activeGroupSeries = useMemo(
    () =>
      activeGroupId === -1
        ? visibleCategories
        : visibleCategories.filter((series) => series.groupId === activeGroupId),
    [activeGroupId, visibleCategories],
  )

  const selectedSeriesCover = selectedSeries?.coverImageUrl

  const selectSeries = (seriesId: number) => {
    onSeriesSelect(seriesId)
    setSeriesDialogOpen(false)
  }

  const openSeriesDialog = () => {
    setActiveGroupId(-1)
    setSeriesDialogOpen(true)
  }

  return (
    <aside className="library-pane quest-pane" aria-label={t('courseMap.ariaLabel')}>
      <div className="pane-heading">
        <Layers3 size={18} aria-hidden="true" />
        <span>{t('courseMap.coursesHeading')}</span>
      </div>

      <button
        className="series-trigger"
        onClick={openSeriesDialog}
        type="button"
        disabled={!selectedSeries}
        aria-haspopup="dialog"
        aria-expanded={seriesDialogOpen}
      >
        {selectedSeriesCover ? (
          <img
            className="series-mark"
            src={resolveApiUrl(selectedSeriesCover)}
            alt={t('courseMap.coverAlt', { name: selectedSeries?.name ?? '' })}
          />
        ) : (
          <span
            className="series-mark series-mark-fallback"
            style={{ background: selectedSeries?.accent }}
            aria-hidden="true"
          >
            <Layers3 size={20} />
          </span>
        )}
        <span className="series-trigger-copy">
          <strong>{selectedSeries?.name ?? t('courseMap.selectCourse')}</strong>
          <small>{selectedSeries?.description ?? t('courseMap.selectCourseHint')}</small>
        </span>
        <ChevronDown size={40} aria-hidden="true" />
      </button>

      <div className="pane-heading compact">
        <BookOpen size={18} aria-hidden="true" />
        <span>{t('courseMap.chaptersHeading')}</span>
      </div>

      <div className="exercise-list quest-list">
        {seriesExercises.map((exercise, index) => {
          const progress = chapterProgressByExercise[exercise.id] ?? {
            exerciseId: exercise.id,
            masteredLineCount: 0,
            percent: 0,
            totalLineCount: exercise.lineCount,
          }
          const completed =
            progress.totalLineCount > 0 && progress.percent >= 100

          return (
            <button
              className={
                exercise.id === activeExerciseId
                  ? 'exercise-item quest-node active'
                  : 'exercise-item quest-node'
              }
              key={exercise.id}
              onClick={() => onExerciseSelect(exercise)}
              type="button"
            >
              <span className="quest-badge">{index + 1}</span>
              <span className="exercise-main">
                <span className="exercise-title">{exercise.title}</span>
              </span>
              <span
                aria-label={
                  completed
                    ? t('courseMap.chapterCompletedAria')
                    : t('courseMap.chapterProgressAria', {
                        percent: progress.percent,
                      })
                }
                className={
                  completed
                    ? 'chapter-progress-ring complete'
                    : 'chapter-progress-ring'
                }
                role="img"
              >
                <svg
                  className="chapter-progress-ring-svg"
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                >
                  <circle
                    className="chapter-progress-ring-bg"
                    cx="24"
                    cy="24"
                    r="18"
                  />
                  <circle
                    className="chapter-progress-ring-fill"
                    cx="24"
                    cy="24"
                    r="18"
                    strokeDasharray={`${(progress.percent / 100) * CHAPTER_PROGRESS_CIRCUMFERENCE} ${CHAPTER_PROGRESS_CIRCUMFERENCE}`}
                  />
                </svg>
                {completed ? (
                  <Check size={18} strokeWidth={4} aria-hidden="true" />
                ) : (
                  <span>{progress.percent}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {seriesDialogOpen && (
        <div
          className="modal-backdrop series-backdrop"
          role="presentation"
          onMouseDown={() => setSeriesDialogOpen(false)}
        >
          <section
            aria-labelledby="series-dialog-title"
            aria-modal="true"
            className="series-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              aria-label={t('courseMap.closeCourseDialog')}
              className="dialog-close"
              onClick={() => setSeriesDialogOpen(false)}
              type="button"
            >
              <X size={18} aria-hidden="true" />
            </button>
            <div className="series-dialog-head">
              <p>{t('courseMap.courseSelection')}</p>
              <h2 id="series-dialog-title">{t('courseMap.dialogTitle')}</h2>
            </div>

            <div className="series-group-tabs" aria-label={t('courseMap.materialCategories')}>
              <button
                className={activeGroupId === -1 ? 'series-group-tab active' : 'series-group-tab'}
                onClick={() => setActiveGroupId(-1)}
                type="button"
              >
                <span className="series-tab-dot" style={{ background: '#64748b' }} aria-hidden="true" />
                {t('courseMap.allGroups')}
              </button>
              {visibleGroups.map((group) => (
                <button
                  className={
                    group.id === activeGroupId
                      ? 'series-group-tab active'
                      : 'series-group-tab'
                  }
                  key={group.id}
                  onClick={() => setActiveGroupId(group.id)}
                  title={group.description}
                  type="button"
                >
                  <span
                    className="series-tab-dot"
                    style={{ background: group.accent }}
                    aria-hidden="true"
                  />
                  {group.name}
                </button>
              ))}
            </div>

            <section className="series-group">
              <div className="series-grid">
                {activeGroupSeries.length > 0 ? (
                  activeGroupSeries.map((item) => {
                    const progress =
                      seriesProgressByCategory[item.id] ?? emptySeriesProgress
                    const completed =
                      progress.totalLineCount > 0 && progress.percent >= 100

                    return (
                      <button
                        className={
                          item.id === selectedSeriesId
                            ? 'series-option active'
                            : 'series-option'
                        }
                        key={item.id}
                        onClick={() => selectSeries(item.id)}
                        type="button"
                      >
                        {item.coverImageUrl ? (
                          <img
                            className="series-mark"
                            src={resolveApiUrl(item.coverImageUrl)}
                            alt={t('courseMap.coverAlt', { name: item.name })}
                          />
                        ) : (
                          <span
                            className="series-mark series-mark-fallback"
                            style={{ background: item.accent }}
                            aria-hidden="true"
                          >
                            <Layers3 size={20} />
                          </span>
                        )}
                        <span className="series-option-copy">
                          <strong>{item.name}</strong>
                          <small>{item.description}</small>
                          <span>
                            {t('courseMap.masteredCount', {
                              mastered: progress.masteredLineCount,
                              total: progress.totalLineCount,
                            })}
                          </span>
                        </span>
                        <span
                          aria-label={
                            completed
                              ? t('courseMap.seriesCompletedAria')
                              : t('courseMap.seriesProgressAria', {
                                  percent: progress.percent,
                                })
                          }
                          className={
                            completed
                              ? 'series-progress-ring complete'
                              : 'series-progress-ring'
                          }
                          role="img"
                          style={
                            {
                              '--series-progress': `${progress.percent}%`,
                            } as CSSProperties
                          }
                        >
                          {completed ? (
                            <Check size={22} strokeWidth={4} aria-hidden="true" />
                          ) : (
                            <span>{progress.percent}%</span>
                          )}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <p className="series-empty">
                    {t('courseMap.emptyCourses')}
                  </p>
                )}
              </div>
            </section>
          </section>
        </div>
      )}
    </aside>
  )
}
