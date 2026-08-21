import {
  TRANSLATION_TARGET_LOCALES,
  type DraftLine,
} from '../../lib/mediaDraftTools'

type SubtitleListProps = {
  activeLineIndex: number
  draftLines: DraftLine[]
  onActiveLineChange: (index: number) => void
}

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
  onActiveLineChange,
}: SubtitleListProps) {
  return (
    <details className="subtitle-list-panel waveform-subtitle-list" open>
      <summary>
        <span>字幕列表</span>
        <strong>{draftLines.length} 条</strong>
      </summary>
      <div className="subtitle-list-table" role="table" aria-label="字幕列表">
        <div className="subtitle-list-row subtitle-list-head" role="row">
          <span role="columnheader">序号</span>
          <span role="columnheader">开始</span>
          <span role="columnheader">结束</span>
          <span role="columnheader">时长</span>
          <span role="columnheader">字幕内容</span>
          <span role="columnheader">中文</span>
          <span role="columnheader">ไทย</span>
          <span role="columnheader">日本語</span>
          <span role="columnheader">可接受答案</span>
        </div>
        {draftLines.map((line, index) => (
          <button
            className={index === activeLineIndex ? 'subtitle-list-row active' : 'subtitle-list-row'}
            key={line.id}
            onClick={() => onActiveLineChange(index)}
            role="row"
            type="button"
          >
            <span role="cell">{index + 1}</span>
            <span role="cell">{formatTimeWithMilliseconds(line.start)}</span>
            <span role="cell">{formatTimeWithMilliseconds(line.end)}</span>
            <span role="cell">{formatTimeWithMilliseconds(Math.max(0, line.end - line.start))}</span>
            <span role="cell">{line.text || '未填写字幕'}</span>
            {TRANSLATION_TARGET_LOCALES.map((locale) => (
              <span role="cell" key={locale}>
                {line.translations[locale] || '未填写'}
              </span>
            ))}
            <span role="cell">
              {(line.answers ?? []).map((answer) => answer.trim()).filter(Boolean).join(' / ') || '无'}
            </span>
          </button>
        ))}
      </div>
    </details>
  )
}
