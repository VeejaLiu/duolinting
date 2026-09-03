import { TriangleAlert } from 'lucide-react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

export type AdminNoticeTone = 'info' | 'success' | 'error'

type AdminConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  alternateLabel?: string
  tone?: 'danger' | 'default'
  onCancel: () => void
  onConfirm: () => void
  onAlternate?: () => void
}

export function AdminConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  alternateLabel,
  tone = 'default',
  onCancel,
  onConfirm,
  onAlternate,
}: AdminConfirmDialogProps) {
  const { t } = useAdminLanguage()
  if (!open) {
    return null
  }

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <div
        className="admin-modal"
        aria-labelledby="admin-confirm-title"
        aria-modal="true"
        role="dialog"
      >
        <div className="admin-modal-head">
          <div className={`admin-modal-icon ${tone}`}>
            <TriangleAlert size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 id="admin-confirm-title">{title}</h2>
            <p>{message}</p>
          </div>
        </div>
        <div className="admin-modal-actions">
          <button className="mini-command secondary" onClick={onCancel} type="button">
            {cancelLabel ?? t('取消')}
          </button>
          {alternateLabel && onAlternate && (
            <button className="mini-command danger" onClick={onAlternate} type="button">
              {alternateLabel}
            </button>
          )}
          <button
            className={tone === 'danger' ? 'mini-command danger' : 'mini-command'}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel ?? t('确认')}
          </button>
        </div>
      </div>
    </div>
  )
}
