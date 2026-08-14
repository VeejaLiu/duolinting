import * as Popover from '@radix-ui/react-popover'
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  Gauge,
  Pause,
  Play,
} from 'lucide-react'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { Tooltip } from './Tooltip'
import type {
  ExerciseProgress,
  LineProgress,
  ListeningExercise,
  TranscriptLine,
} from '@duolinting/shared'
import { TranscriptPanel } from './TranscriptPanel'
import { useLanguage } from '../i18n/LanguageProvider'
import { resolveApiUrl } from '../lib/apiClient'

type IntensiveStageProps = {
  exercise: ListeningExercise
  mediaRef: RefObject<HTMLMediaElement | null>
  progress: ExerciseProgress
  selectedLine: TranscriptLine
  selectedLineIndex: number
  lineProgress: LineProgress
  revealedLineIds: Record<string, true>
  isPlaying: boolean
  onPlayLine: (line: TranscriptLine) => void
  onTogglePlayback: () => void
  onMoveLine: (offset: number) => void
  onRevealLine: (lineId: string) => void
  onPlaybackRateChange: (rate: number) => void
  onMarkUnclear: (lineId: string) => void
  onMarkMastered: (lineId: string) => void
  onLineSelect: (lineId: string) => void
}

const playbackRates = [
  0.75,
  0.9,
  1,
  1.15,
  1.3,
]

const formatLineDuration = (start: number, end: number) => {
  const durationSeconds = Math.max(0, end - start)
  const roundedDuration = Math.round(durationSeconds * 100) / 100
  return Number.isInteger(roundedDuration)
    ? `${roundedDuration}s`
    : `${roundedDuration.toFixed(2).replace(/\.?0+$/, '')}s`
}

export function IntensiveStage({
  exercise,
  mediaRef,
  progress,
  selectedLine,
  selectedLineIndex,
  lineProgress,
  revealedLineIds,
  isPlaying,
  onPlayLine,
  onTogglePlayback,
  onMoveLine,
  onRevealLine,
  onPlaybackRateChange,
  onMarkUnclear,
  onMarkMastered,
  onLineSelect,
}: IntensiveStageProps) {
  const [ratePickerOpen, setRatePickerOpen] = useState(false)
  const { t } = useLanguage()
  const sentenceVisible = Boolean(revealedLineIds[selectedLine.id])

  const handleMarkMastered = useCallback(() => {
    // 点击"我已掌握"时触发一次显示字幕
    if (!sentenceVisible) {
      onRevealLine(selectedLine.id)
    }
    onMarkMastered(selectedLine.id)
  }, [sentenceVisible, onRevealLine, onMarkMastered, selectedLine.id])

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // 如果 Popover 打开，不响应快捷键
      if (ratePickerOpen) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          onMoveLine(-1)
          break
        case 'ArrowRight':
          event.preventDefault()
          onMoveLine(1)
          break
        case ' ':
          event.preventDefault()
          if (isPlaying) {
            onTogglePlayback()
          } else {
            onPlayLine(selectedLine)
          }
          break
        case 'f':
        case 'F':
          handleMarkMastered()
          break
        case 'd':
        case 'D':
          onMarkUnclear(selectedLine.id)
          break
        case 'r':
        case 'R':
          onRevealLine(selectedLine.id)
          break
      }
    },
    [
      ratePickerOpen,
      isPlaying,
      onMoveLine,
      onTogglePlayback,
      onPlayLine,
      selectedLine,
      onMarkUnclear,
      onRevealLine,
      handleMarkMastered,
    ],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <section className="stage-board intensive-board">
      <div className="sentence-workbench">
        <div className="lesson-media-card">
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

          <div className="media-subtitle-overlay">
            <div className="subtitle-topline">
              <span>{String(selectedLineIndex + 1).padStart(2, '0')} / {exercise.lines.length}</span>
              <span>{formatLineDuration(selectedLine.start, selectedLine.end)}</span>
            </div>
            <p className={sentenceVisible ? 'subtitle-text revealed' : 'subtitle-text'}>
              {sentenceVisible
                ? selectedLine.text
                : t('intensive.subtitlePrompt')}
            </p>
            <p className={sentenceVisible ? 'subtitle-translation revealed' : 'subtitle-translation hidden'}>
              {selectedLine.translation || ' '}
            </p>
          </div>

          <div className="media-overlay-controls" aria-label={t('intensive.controlsLabel')}>
            <div className="control-cluster">
              <Tooltip label={t('intensive.prevSentence')} shortcut="←">
                <button
                  className="icon-button"
                  disabled={selectedLineIndex === 0}
                  onClick={() => onMoveLine(-1)}
                  type="button"
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                  <span>{t('intensive.prevShort')}</span>
                </button>
              </Tooltip>
              <Tooltip label={isPlaying ? t('intensive.pause') : t('intensive.playLine')} shortcut={t('intensive.spaceKey')}>
                <button
                  className="icon-button primary wide"
                  onClick={isPlaying ? onTogglePlayback : () => onPlayLine(selectedLine)}
                  type="button"
                >
                  {isPlaying
                    ? <Pause size={18} aria-hidden="true" />
                    : <Play size={18} aria-hidden="true" />}
                  <span>{isPlaying ? t('intensive.pausePlayback') : t('intensive.playLine')}</span>
                </button>
              </Tooltip>
              <Tooltip label={t('intensive.showTranscript')} shortcut="R">
                <button
                  className="icon-button reveal"
                  onClick={() => onRevealLine(selectedLine.id)}
                  type="button"
                >
                  <Eye size={18} aria-hidden="true" />
                  <span>{t('intensive.transcript')}</span>
                </button>
              </Tooltip>
              <Tooltip label={t('intensive.nextSentence')} shortcut="→">
                <button
                  className="icon-button"
                  disabled={selectedLineIndex >= exercise.lines.length - 1}
                  onClick={() => onMoveLine(1)}
                  type="button"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                  <span>{t('intensive.nextShort')}</span>
                </button>
              </Tooltip>
            </div>
            <Popover.Root open={ratePickerOpen} onOpenChange={setRatePickerOpen}>
              <div className="rate-control compact-rate" aria-label={t('intensive.rateLabel')}>
                <Gauge size={17} aria-hidden="true" />
                <Popover.Trigger asChild>
                  <button
                    aria-expanded={ratePickerOpen}
                    className={ratePickerOpen ? 'rate-trigger active' : 'rate-trigger'}
                    type="button"
                  >
                    <span className="rate-value">{progress.playbackRate}x</span>
                    <ChevronDown size={24} strokeWidth={3} aria-hidden="true" />
                  </button>
                </Popover.Trigger>
              </div>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  className="rate-popover"
                  side="bottom"
                  sideOffset={10}
                >
                  <div role="radiogroup">
                    {playbackRates.map((rate) => (
                      <button
                        aria-checked={progress.playbackRate === rate}
                        className={
                          progress.playbackRate === rate
                            ? 'rate-option active'
                            : 'rate-option'
                        }
                        key={rate}
                        onClick={() => {
                          onPlaybackRateChange(rate)
                          setRatePickerOpen(false)
                        }}
                        role="radio"
                        type="button"
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>

        <div className="status-actions">
          <Tooltip label={t('intensive.markDifficult')} shortcut="D">
            <button
              className={lineProgress.unclear ? 'pill active' : 'pill'}
              onClick={() => onMarkUnclear(selectedLine.id)}
              type="button"
            >
              <CircleHelp size={18} aria-hidden="true" />
              {t('intensive.markDifficult')}
            </button>
          </Tooltip>
          <Tooltip label={lineProgress.mastered ? t('intensive.undoMastered') : t('intensive.mastered')} shortcut="F">
            <button
              className={lineProgress.mastered ? 'pill success' : 'pill'}
              onClick={handleMarkMastered}
              type="button"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              {lineProgress.mastered ? t('intensive.undoMastered') : t('intensive.mastered')}
            </button>
          </Tooltip>
        </div>
      </div>

      <TranscriptPanel
        exercise={exercise}
        progress={progress}
        selectedLineId={selectedLine.id}
        revealedLineIds={revealedLineIds}
        onLineSelect={onLineSelect}
      />
    </section>
  )
}
