import { X } from 'lucide-react'
import { useState } from 'react'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'
import { WebReauthForm } from './WebReauthForm'

type Action = { kind: 'delete' } | { kind: 'unlink'; provider: 'apple' | 'google' }

export function SecurityActionDialog({ action, authToken, onClose, onDone }: {
  action: Action | null
  authToken: string
  onClose: () => void
  onDone: (deleted: boolean) => void
}) {
  const { t } = useLanguage()
  const [ticket, setTicket] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!action) return null
  const close = () => { setTicket(''); setError(''); onClose() }
  const confirm = async () => {
    if (!ticket || busy) return
    setBusy(true); setError('')
    try {
      let sessionRevoked = false
      if (action.kind === 'delete') await apiClient.deleteAccount({ reauthTicket: ticket }, authToken)
      else sessionRevoked = (await apiClient.unlinkOAuthIdentity(action.provider, ticket, authToken)).currentSessionRevoked
      setTicket('')
      onDone(action.kind === 'delete' || sessionRevoked)
    } catch {
      setTicket('')
      setError(t('authSecurity.actionFailed'))
    } finally { setBusy(false) }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}>
    <section aria-labelledby="security-action-title" aria-modal="true" className="auth-dialog settings-dialog" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
      <button aria-label={t('auth.closeDialog')} className="dialog-close" onClick={close} type="button"><X size={18} aria-hidden="true" /></button>
      <div className="dialog-hero"><p>{t('settings.account')}</p><h2 id="security-action-title">{t(action.kind === 'delete' ? 'authSecurity.delete' : 'authSecurity.unlink')}</h2>
        <span>{action.kind === 'delete' ? t('authSecurity.deleteHint') : t('authSecurity.unlinkHint', { provider: action.provider })}</span></div>
      {ticket ? <div className="auth-form"><button className="danger-command" disabled={busy} onClick={() => void confirm()} type="button">{t(action.kind === 'delete' ? 'authSecurity.deleteConfirm' : 'authSecurity.unlink')}</button></div>
        : <WebReauthForm purpose={action.kind === 'delete' ? 'delete_account' : 'unlink_identity'} authToken={authToken} onTicket={setTicket} />}
      {error ? <p className="settings-message error" role="alert">{error}</p> : null}
    </section>
  </div>
}
