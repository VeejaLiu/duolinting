import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  TRANSLATION_TARGET_LOCALES,
  type DraftLine,
} from '../../lib/mediaDraftTools'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type SubtitleListProps = {
  activeLineIndex: number
  draftLines: DraftLine[]
  embedded?: boolean
  onActiveLineChange: (index: number) => void
}

type SubtitleTableRow = {
  index: number
  line: DraftLine
}

const MIN_EMBEDDED_TIME_COLUMN_WIDTH = 150
const MAX_EMBEDDED_TIME_COLUMN_WIDTH = 240
const DEFAULT_EMBEDDED_TIME_COLUMN_WIDTH = 178

const formatTimeWithMilliseconds = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '00:00.000'
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000))
  const minutes = Math.floor(totalMilliseconds / 60000)
  const remainingSeconds = Math.floor((totalMilliseconds % 60000) / 1000)
  const milliseconds = totalMilliseconds % 1000
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

export function SubtitleList({
  activeLineIndex,
  draftLines,
  embedded = false,
  onActiveLineChange,
}: SubtitleListProps) {
  const { t } = useAdminLanguage()
  const [embeddedTimeColumnWidth, setEmbeddedTimeColumnWidth] = useState(
    DEFAULT_EMBEDDED_TIME_COLUMN_WIDTH,
  )
  const timeColumnResizeRef = useRef<{ startWidth: number; startX: number } | null>(null)

  const handleTimeColumnResizeStart = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    timeColumnResizeRef.current = {
      startWidth: embeddedTimeColumnWidth,
      startX: event.clientX,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleTimeColumnResizeMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const resize = timeColumnResizeRef.current
    if (!resize) return

    // 时间列宽度以拖动起点为基准，并限制上下界，避免挤没时间文本或吞掉字幕区域。
    const nextWidth = Math.min(
      MAX_EMBEDDED_TIME_COLUMN_WIDTH,
      Math.max(MIN_EMBEDDED_TIME_COLUMN_WIDTH, resize.startWidth + event.clientX - resize.startX),
    )
    setEmbeddedTimeColumnWidth(Math.round(nextWidth))
  }

  const handleTimeColumnResizeEnd = (event: ReactPointerEvent<HTMLSpanElement>) => {
    timeColumnResizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const rows: SubtitleTableRow[] = draftLines.map((line, index) => ({ index, line }))
  const embeddedColumns: ColumnsType<SubtitleTableRow> = [
    {
      align: 'center',
      key: 'index',
      render: (_, row) => row.index + 1,
      title: t('序号'),
      width: 48,
    },
    {
      key: 'time',
      render: (_, row) => (
        <span className="subtitle-table-time">
          {formatTimeWithMilliseconds(row.line.start)} - {formatTimeWithMilliseconds(row.line.end)}
        </span>
      ),
      title: (
        <span className="subtitle-resizable-column-title">
          {t('时间')}
          <span
            aria-label={t('拖动调整时间列宽度')}
            className="subtitle-column-resize-handle"
            onPointerCancel={handleTimeColumnResizeEnd}
            onPointerDown={handleTimeColumnResizeStart}
            onPointerMove={handleTimeColumnResizeMove}
            onPointerUp={handleTimeColumnResizeEnd}
            role="separator"
          />
        </span>
      ),
      width: embeddedTimeColumnWidth,
    },
    {
      ellipsis: true,
      key: 'text',
      render: (_, row) => row.line.text || t('未填写字幕'),
      title: t('字幕内容'),
      width: 320,
    },
  ]
  const fullColumns: ColumnsType<SubtitleTableRow> = [
    {
      align: 'center',
      key: 'index',
      render: (_, row) => row.index + 1,
      title: t('序号'),
      width: 64,
    },
    {
      key: 'start',
      render: (_, row) => formatTimeWithMilliseconds(row.line.start),
      title: t('开始'),
      width: 110,
    },
    {
      key: 'end',
      render: (_, row) => formatTimeWithMilliseconds(row.line.end),
      title: t('结束'),
      width: 110,
    },
    {
      key: 'duration',
      render: (_, row) => formatTimeWithMilliseconds(
        Math.max(0, row.line.end - row.line.start),
      ),
      title: t('时长'),
      width: 110,
    },
    {
      ellipsis: true,
      key: 'text',
      render: (_, row) => row.line.text || t('未填写字幕'),
      title: t('字幕内容'),
      width: 280,
    },
    ...TRANSLATION_TARGET_LOCALES.map((locale, index) => ({
      ellipsis: true,
      key: locale,
      render: (_: unknown, row: SubtitleTableRow) => row.line.translations[locale] || t('未填写'),
      title: t(['中文', 'ไทย', '日本語'][index]),
      width: 180,
    })),
    {
      ellipsis: true,
      key: 'answers',
      render: (_, row) => (
        (row.line.answers ?? []).map((answer) => answer.trim()).filter(Boolean).join(' / ') || t('无')
      ),
      title: t('可接受答案'),
      width: 220,
    },
  ]
  const table = (
    <Table<SubtitleTableRow>
      bordered
      className="subtitle-list-antd-table"
      columns={embedded ? embeddedColumns : fullColumns}
      dataSource={rows}
      locale={{ emptyText: t('暂无字幕') }}
      onRow={(row) => ({ onClick: () => onActiveLineChange(row.index) })}
      pagination={false}
      rowClassName={(row) => row.index === activeLineIndex ? 'subtitle-table-row-active' : ''}
      rowKey={(row) => row.line.id}
      scroll={{ x: embedded ? 48 + embeddedTimeColumnWidth + 320 : 1434 }}
      size="small"
      tableLayout="fixed"
    />
  )

  if (embedded) {
    return <div className="subtitle-list-embedded">{table}</div>
  }

  return (
    <details className="subtitle-list-panel waveform-subtitle-list" open>
      <summary>
        <span>{t('字幕列表')}</span>
        <strong>{draftLines.length} {t('条')}</strong>
      </summary>
      {table}
    </details>
  )
}
