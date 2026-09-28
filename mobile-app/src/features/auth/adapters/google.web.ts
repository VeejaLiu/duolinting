import type { OAuthStartResponse } from '@duolinting/domain'

type GoogleCredential = { credential?: string }
type PromptNotification = {
  isNotDisplayed: () => boolean
  isSkippedMoment: () => boolean
  getSkippedReason?: () => string
}
type GoogleApi = { accounts: { id: {
  initialize: (config: { client_id: string; nonce: string; callback: (response: GoogleCredential) => void }) => void
  prompt: (callback: (notification: PromptNotification) => void) => void
  renderButton: (parent: HTMLElement, options: { theme: string; size: string; text: string; width: number }) => void
} } }

declare global { interface Window { google?: GoogleApi } }

let scriptPromise: Promise<void> | null = null
const loadGoogleScript = () => {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    if (window.google) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google sign-in is unavailable'))
    document.head.appendChild(script)
  }).catch((error) => { scriptPromise = null; throw error })
  return scriptPromise
}

export async function authorizeGoogle(start: OAuthStartResponse, webClientId: string) {
  await loadGoogleScript()
  const google = window.google
  if (!google) throw new Error('Google sign-in is unavailable')
  return new Promise<{ idToken: string } | null>((resolve, reject) => {
    let finished = false
    let overlay: HTMLDivElement | null = null
    const timeout = window.setTimeout(() => finish(new Error('Google sign-in timed out')), 2 * 60 * 1000)
    const finish = (result: { idToken: string } | Error | null) => {
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      overlay?.remove()
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    const showOfficialButton = () => {
      if (finished || overlay) return
      // One Tap can be suppressed by browser or account settings. The Google
      // owned button keeps the same nonce-bound transaction usable.
      overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(18,32,51,.5);padding:20px;'
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.style.cssText = 'position:relative;max-width:360px;width:100%;border-radius:20px;background:#fff;padding:44px 20px 28px;box-shadow:0 20px 60px rgba(0,0,0,.22);'
      const close = document.createElement('button')
      close.type = 'button'
      close.setAttribute('aria-label', 'Close Google sign-in')
      close.textContent = '×'
      close.style.cssText = 'position:absolute;right:12px;top:8px;border:0;background:transparent;color:#52637a;font-size:30px;cursor:pointer;'
      close.onclick = () => finish(null)
      const button = document.createElement('div')
      button.style.cssText = 'display:flex;justify-content:center;min-height:44px;'
      dialog.append(close, button)
      overlay.appendChild(dialog)
      document.body.appendChild(overlay)
      google.accounts.id.renderButton(button, { theme: 'outline', size: 'large', text: 'continue_with', width: Math.min(300, Math.max(200, window.innerWidth - 80)) })
    }
    google.accounts.id.initialize({ client_id: webClientId, nonce: start.nonce, callback: (response) => {
      if (response.credential) finish({ idToken: response.credential })
      else finish(new Error('Google did not return an ID token'))
    } })
    google.accounts.id.prompt((notification) => {
      if (notification.isSkippedMoment() && notification.getSkippedReason?.() === 'user_cancel') {
        finish(null)
      } else if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        showOfficialButton()
      }
    })
  })
}
