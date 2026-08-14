import { ListChecks } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type {
  ExerciseProgress,
  ListeningExercise,
  TranscriptLine,
} from '@duolinting/shared'
import { createLineProgress } from '../lib/progressStore'
import { useLanguage } from '../i18n/LanguageProvider'

const shortLine = (line: TranscriptLine) =>
  line.text.length > 82 ? `${line.text.slice(0, 82)}...` : line.text

type TranscriptPanelProps = {
  exercise: ListeningExercise
  progress: ExerciseProgress
  selectedLineId: string
  revealedLineIds: Record<string, true>
  onLineSelect: (lineId: string) => void
}

export function TranscriptPanel({
  exercise,
  progress,
  selectedLineId,
  revealedLineIds,
  onLineSelect,
}: TranscriptPanelProps) {
  const { t } = useLanguage()
  const listRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    const container = listRef.current
    if (!container) return

    const activeItem = container.querySelector<HTMLElement>('.line-row.active')
    if (!activeItem) return

    // 只滚动句子面板自身，不用 scrollIntoView：scrollIntoView 会连带滚动所有
    // 外层可滚动祖先（包括 .study-pane），切换学习阶段面板挂载时会把上方的
    // 章节信息条一起带着滚动，造成页面「抽动」。
    const panel = container.closest<HTMLElement>('.compact-panel')
    if (!panel) return
    const panelRect = panel.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    panel.scrollTo({
      top:
        panel.scrollTop +
        (itemRect.top - panelRect.top) -
        panel.clientHeight / 2 +
        itemRect.height / 2,
      behavior: 'smooth',
    })
  }, [selectedLineId])

  return (
    <aside className="transcript-panel compact-panel level-list">
      <div className="panel-title">
        <ListChecks size={17} aria-hidden="true" />
        <span>{t('transcript.panelTitle')}</span>
      </div>
      <ol className="line-list" ref={listRef}>
        {exercise.lines.map((line, index) => {
          const item = progress.lines[line.id] ?? createLineProgress()
          const lineVisible = Boolean(revealedLineIds[line.id]) || item.mastered
          return (
            <li
              className={
                selectedLineId === line.id
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
                <span className="line-copy">
                  {lineVisible ? shortLine(line) : t('transcript.hiddenLineChallenge')}
                </span>
              </button>
              <div className="line-actions">
                {item.unclear && <span className="status-dot warning" />}
                {item.mastered && <span className="status-dot success" />}
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
