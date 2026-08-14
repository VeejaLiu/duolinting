import { X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'

type ChangePasswordDialogProps = {
  open: boolean
  authToken: string
  onClose: () => void
}

/** 修改密码弹窗：设置页账号卡片点击进入，表单与校验都在这里闭环。 */
export function ChangePasswordDialog({ open, authToken, onClose }: ChangePasswordDialogProps) {
  const { t } = useLanguage()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // 关闭时重置表单，避免上一次的输入和结果残留到下次打开
  const handleClose = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setFeedback(null)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    if (!currentPassword) {
      setFeedback({ kind: 'error', text: t('settings.currentRequired') })
      return
    }
    if (newPassword.length < 8) {
      setFeedback({ kind: 'error', text: t('settings.newMinLength') })
      return
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ kind: 'error', text: t('settings.notMatched') })
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      // changePassword 成功时直接返回 AuthResponse，失败抛 ApiClientError
      await apiClient.changePassword({ currentPassword, newPassword }, authToken)
      setFeedback({ kind: 'success', text: t('settings.changeSuccess') })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error && error.message ? error.message : t('settings.changeFailed'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <section
        aria-labelledby="change-password-dialog-title"
        aria-modal="true"
        className="auth-dialog settings-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          aria-label={t('auth.closeDialog')}
          className="dialog-close"
          onClick={handleClose}
          type="button"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="dialog-hero">
          <p>{t('settings.account')}</p>
          <h2 id="change-password-dialog-title">{t('settings.changePassword')}</h2>
          <span>{t('settings.changePasswordDescription')}</span>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label className="settings-field">
            <span className="settings-field-label">{t('settings.currentPassword')}</span>
            <input
              autoComplete="current-password"
              className="settings-input"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">{t('settings.newPassword')}</span>
            <input
              autoComplete="new-password"
              className="settings-input"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />
            <span className="settings-field-hint">{t('settings.passwordHint')}</span>
          </label>
          <label className="settings-field">
            <span className="settings-field-label">{t('settings.confirmPassword')}</span>
            <input
              autoComplete="new-password"
              className="settings-input"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </label>
          <button className="settings-submit" disabled={submitting} type="submit">
            {submitting ? t('settings.submitting') : t('settings.submit')}
          </button>
          {feedback ? (
            <p className={`settings-message ${feedback.kind}`}>{feedback.text}</p>
          ) : null}
        </form>
      </section>
    </div>
  )
}
