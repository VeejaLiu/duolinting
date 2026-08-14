import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Pause,
  Play,
} from 'lucide-react'
import { useCallback, useEffect, type RefObject } from 'react'
import type {
  ExerciseProgress,
  ListeningExercise,
  TranscriptLine,
} from '@duolinting/shared'
import { useLanguage } from '../i18n/LanguageProvider'
import { createLineProgress } from '../lib/progressStore'
import { resolveApiUrl } from '../lib/apiClient'
import { Tooltip } from './Tooltip'

type DifficultReviewStageProps = {
  exercise: ListeningExercise
  mediaRef: RefObject<HTMLMediaElement | null>
  progress: ExerciseProgress
  reviewLines: TranscriptLine[]
  selectedLine: TranscriptLine | null
  isPlaying: boolean
  onBackToIntensive: () => void
  onLineSelect: (lineId: string) => void
  onMarkMastered: (lineId: string) => void
  onMarkUnclear: (lineId: string) => void
  onMoveReviewLine: (offset: number) => void
  onPlayLine: (line: TranscriptLine) => void
  onTogglePlayback: () => void
}

export function DifficultReviewStage({
  exercise,
  mediaRef,
  progress,
  reviewLines,
  selectedLine,
  isPlaying,
  onBackToIntensive,
  onLineSelect,
  onMarkMastered,
  onMarkUnclear,
  onMoveReviewLine,
  onPlayLine,
  onTogglePlayback,
}: DifficultReviewStageProps) {
  const { t } = useLanguage()
  const selectedIndex = selectedLine
    ? reviewLines.findIndex((line) => line.id === selectedLine.id)
    : -1
  const selectedProgress = selectedLine
    ? progress.lines[selectedLine.id] ?? createLineProgress()
    : createLineProgress()

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!selectedLine) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          onMoveReviewLine(-1)
          break
        case 'ArrowRight':
          event.preventDefault()
          onMoveReviewLine(1)
          break
        case ' ':
          event.preventDefault()
          if (isPlaying) {
            onTogglePlayback()
          } else {
            onPlayLine(selectedLine)
          }
          break
        case 'd':
        case 'D':
          event.preventDefault()
          onMarkUnclear(selectedLine.id)
          break
        case 'f':
        case 'F':
          event.preventDefault()
          onMarkMastered(selectedLine.id)
          break
      }
    },
    [
      selectedLine,
      isPlaying,
      onMoveReviewLine,
      onTogglePlayback,
      onPlayLine,
      onMarkUnclear,
      onMarkMastered,
    ],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (reviewLines.length === 0 || !selectedLine) {
    return (
      <section className="stage-board difficult-review-board">
        <div className="review-empty-card">
          <CircleHelp size={26} aria-hidden="true" />
          <strong>{t('review.emptyTitle')}</strong>
          <button className="icon-button primary wide" onClick={onBackToIntensive} type="button">
            {t('review.backToIntensive')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="stage-board difficult-review-board">
      <div className="review-workbench">
        <div className="lesson-media-card review-media-card">
          {exercise.mediaType === 'video' ? (
            <video
              ref={mediaRef as RefObject<HTMLVideoElement | null>}
              className="lesson-media lesson-video"
              playsInline
              preload="metadata"
              src={resolveApiUrl(exercise.audioUrl)}
            />
          ) : (
            <audio
              ref={mediaRef as RefObject<HTMLAudioElement | null>}
              className="lesson-media lesson-audio"
              preload="metadata"
              src={resolveApiUrl(exercise.audioUrl)}
            />
          )}

          <div className="media-subtitle-overlay review-subtitle-overlay">
            <div className="subtitle-topline">
              <span>{String(selectedIndex + 1).padStart(2, '0')} / {reviewLines.length}</span>
              <span>{t('review.title')}</span>
            </div>
            <p className="subtitle-text revealed">{selectedLine.text}</p>
            <p className="subtitle-translation revealed">
              {selectedLine.translation || ' '}
            </p>
          </div>

          <div className="media-overlay-controls" aria-label={t('review.mediaControlsLabel')}>
            <div className="control-cluster">
              <Tooltip label={t('review.previousTooltip')} shortcut="←">
                <button
                  className="icon-button"
                  disabled={selectedIndex <= 0}
                  onClick={() => onMoveReviewLine(-1)}
                  type="button"
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                  <span>{t('review.previous')}</span>
                </button>
              </Tooltip>
              <Tooltip label={isPlaying ? t('review.pause') : t('review.playLineTooltip')} shortcut={t('review.spaceShortcut')}>
                <button
                  className="icon-button primary wide"
                  onClick={isPlaying ? onTogglePlayback : () => onPlayLine(selectedLine)}
                  type="button"
                >
                  {isPlaying
                    ? <Pause size={18} aria-hidden="true" />
                    : <Play size={18} aria-hidden="true" />}
                  <span>{isPlaying ? t('review.pause') : t('review.play')}</span>
                </button>
              </Tooltip>
              <Tooltip label={t('review.nextTooltip')} shortcut="→">
                <button
                  className="icon-button"
                  disabled={selectedIndex >= reviewLines.length - 1}
                  onClick={() => onMoveReviewLine(1)}
                  type="button"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                  <span>{t('review.next')}</span>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="status-actions review-status-actions">
          <Tooltip label={t('review.removeDifficult')} shortcut="D">
            <button
              className="pill active"
              onClick={() => onMarkUnclear(selectedLine.id)}
              type="button"
            >
              <CircleHelp size={18} aria-hidden="true" />
              {t('review.removeDifficult')}
            </button>
          </Tooltip>
          <Tooltip label={selectedProgress.mastered ? t('review.unmarkMastered') : t('review.mastered')} shortcut="F">
            <button
              className={selectedProgress.mastered ? 'pill success' : 'pill'}
              onClick={() => onMarkMastered(selectedLine.id)}
              type="button"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              {selectedProgress.mastered ? t('review.unmarkMastered') : t('review.mastered')}
            </button>
          </Tooltip>
        </div>
      </div>

      <aside className="transcript-panel compact-panel level-list difficult-list">
        <div className="panel-title">
          <CircleHelp size={17} aria-hidden="true" />
          <span>{t('review.sentenceListTitle')}</span>
        </div>
        <ol className="line-list">
          {reviewLines.map((line, index) => {
            const item = progress.lines[line.id] ?? createLineProgress()
            return (
              <li
                className={
                  selectedLine.id === line.id
                    ? 'line-row active'
                    : item.mastered
                      ? 'line-row mastered'
                      : 'line-row'
                }
                key={line.id}
              >
                <button
                  className="line-main"
                  onClick={() => onLineSelect(line.id)}
                  type="button"
                >
                  <span className="line-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="line-copy">{line.text}</span>
                </button>
                <div className="line-actions">
                  {item.mastered && <span className="status-dot success" />}
                  <span className="status-dot warning" />
                </div>
              </li>
            )
          })}
        </ol>
      </aside>
    </section>
  )
}
