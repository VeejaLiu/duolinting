import { Button, Popover, Tooltip } from 'antd'
import { History, Redo2, Undo2 } from 'lucide-react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { SUBTITLE_HISTORY_LIMIT, type SubtitleHistory } from '../../lib/subtitleHistory'

type Props = {
  history: SubtitleHistory
  disabled: boolean
  onUndo: (steps?: number) => void
  onRedo: (steps?: number) => void
}

export function SubtitleHistoryControls({ history, disabled, onUndo, onRedo }: Props) {
  const { t } = useAdminLanguage()
  const undoLabel = history.past.at(-1)?.label
  const redoLabel = history.future[0]?.label
  return (
    <div className="subtitle-history-controls" role="group" aria-label={t('字幕编辑历史')}>
      <Tooltip title={`${t('撤销')}${undoLabel ? `：${t(undoLabel)}` : ''} (Ctrl/⌘ Z)`}>
        <Button
          disabled={disabled || !undoLabel}
          icon={<Undo2 size={15} aria-hidden="true" />}
          onClick={() => onUndo()}
        >{t('撤销')}</Button>
      </Tooltip>
      <Tooltip title={`${t('重做')}${redoLabel ? `：${t(redoLabel)}` : ''} (Ctrl/⌘ Shift Z / Ctrl Y)`}>
        <Button
          disabled={disabled || !redoLabel}
          icon={<Redo2 size={15} aria-hidden="true" />}
          onClick={() => onRedo()}
        >{t('重做')}</Button>
      </Tooltip>
      <Popover
        trigger="click"
        placement="bottomRight"
        title={t('字幕编辑历史')}
        content={
          <div className="subtitle-history-panel">
            <p>{t('保留本次编辑最近 {{count}} 步字幕操作；保存后仍可撤销，刷新或切换课程后清空。', { count: SUBTITLE_HISTORY_LIMIT })}</p>
            {!history.past.length && !history.future.length && <p>{t('暂无编辑历史')}</p>}
            <div className="subtitle-history-list">
              {history.future.length > 0 && <strong>{t('可重做')}</strong>}
              {history.future.map((entry, index) => (
                <Button key={`redo-${index}`} block disabled={disabled} onClick={() => onRedo(index + 1)}>
                  {t('重做到此步')} · {t(entry.label)}
                </Button>
              ))}
              {history.past.length > 0 && <strong>{t('可撤销（最近优先）')}</strong>}
              {[...history.past].reverse().map((entry, index) => (
                <Button key={`undo-${index}`} block disabled={disabled} onClick={() => onUndo(index + 1)}>
                  {t('撤销至此步之前')} · {t(entry.label)}
                </Button>
              ))}
            </div>
          </div>
        }
      >
        <Button icon={<History size={15} aria-hidden="true" />}>{t('历史')}</Button>
      </Popover>
    </div>
  )
}
