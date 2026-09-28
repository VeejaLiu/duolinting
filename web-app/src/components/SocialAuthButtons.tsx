import { useEffect, useRef, useState } from 'react'
import type { OAuthConfig, OAuthProvider, OAuthPurpose, OAuthResult, ReauthPurpose } from '@duolinting/domain'
import { apiClient } from '../lib/apiClient'
import { useLanguage } from '../i18n/LanguageProvider'

type GoogleCredential = { credential?: string }
type GoogleApi = { accounts: { id: {
  initialize: (config: { client_id: string; nonce: string; callback: (response: GoogleCredential) => void }) => void
  renderButton: (element: HTMLElement, options: { theme: string; size: string; text: string; width: number }) => void
} } }
declare global { interface Window { google?: GoogleApi } }

let googleScript: Promise<void> | null = null
const loadGoogle = () => {
  googleScript ??= new Promise<void>((resolve, reject) => {
    if (window.google) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google sign-in unavailable'))
    document.head.appendChild(script)
  })
  return googleScript
}
const makeVerifier = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')

function GoogleButton({ clientId, purpose, reauthPurpose, authToken, onResult, onError }: { clientId: string; purpose: OAuthPurpose; reauthPurpose?: ReauthPurpose; authToken?: string; onResult: (result: OAuthResult) => void; onError: () => void }) {
  const container = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onResult, onError })
  callbacks.current = { onResult, onError }
  useEffect(() => {
    let active = true
    let timer: number | undefined
    const prepare = async () => {
      try {
        const start = await apiClient.startOAuth({ provider: 'google', purpose, platform: 'web', reauthPurpose }, authToken)
        await loadGoogle()
        if (!active || !window.google || !container.current) return
        container.current.replaceChildren()
        window.google.accounts.id.initialize({ client_id: clientId, nonce: start.nonce, callback: (response) => {
          if (!active || !response.credential) { callbacks.current.onError(); return }
          void apiClient.completeOAuth({ transactionId: start.transactionId, idToken: response.credential }, authToken).then(callbacks.current.onResult).catch(callbacks.current.onError)
        } })
        window.google.accounts.id.renderButton(container.current, { theme: 'outline', size: 'large', text: 'continue_with', width: Math.min(300, Math.max(200, container.current.clientWidth)) })
        timer = window.setTimeout(() => { if (active) void prepare() }, 4 * 60 * 1000)
      } catch { if (active) callbacks.current.onError() }
    }
    void prepare()
    return () => { active = false; if (timer) window.clearTimeout(timer) }
  }, [clientId, purpose, reauthPurpose, authToken])
  return <div className="social-google-button" ref={container} />
}

export function SocialAuthButtons({ purpose = 'login', reauthPurpose, authToken, allowedProviders, onResult, onError }: { purpose?: OAuthPurpose; reauthPurpose?: ReauthPurpose; authToken?: string; allowedProviders?: OAuthProvider[]; onResult: (result: OAuthResult) => void; onError: () => void }) {
  const { t } = useLanguage()
  const [config, setConfig] = useState<OAuthConfig | null>(null)
  const [appleBusy, setAppleBusy] = useState(false)
  useEffect(() => {
    let active = true
    void apiClient.getOAuthConfig().then((value) => { if (active) setConfig(value) }).catch(() => {})
    return () => { active = false }
  }, [])
  const googleReady = config?.enabled.googleWeb && (!allowedProviders || allowedProviders.includes('google'))
  const appleReady = config?.enabled.appleWeb && Boolean(config.appleCallbackOrigin) && (!allowedProviders || allowedProviders.includes('apple'))
  if (!googleReady && !appleReady) return null

  const apple = async () => {
    if (appleBusy) return
    // Open during the click gesture. Browsers commonly block popups opened
    // only after the asynchronous start request returns.
    const popup = window.open('', 'duolinting-apple', 'popup,width=520,height=680')
    if (!popup) { onError(); return }
    const authPopup = popup
    setAppleBusy(true)
    const verifier = makeVerifier()
    try {
      const start = await apiClient.startOAuth({ provider: 'apple', purpose, platform: 'web', verifier, returnOrigin: window.location.origin, reauthPurpose }, authToken)
      if (!start.authorizationUrl) throw new Error('Missing Apple authorization URL')
      const result = await new Promise<OAuthResult | null>((resolve, reject) => {
        const timeout = window.setTimeout(() => finish(new Error('Apple sign-in timed out')), 5 * 60 * 1000)
        const closed = window.setInterval(() => { if (authPopup.closed) finish(null) }, 500)
        const expectedOrigin = config.appleCallbackOrigin
        const onMessage = (event: MessageEvent) => {
          if (!expectedOrigin || event.origin !== expectedOrigin || event.source !== authPopup || event.data?.type !== 'duolinting-oauth') return
          if (event.data.cancelled === true) { finish(null); return }
          const ticket = event.data.ticket
          if (typeof ticket !== 'string') { finish(new Error('Invalid Apple exchange ticket')); return }
          void apiClient.exchangeOAuth(ticket, verifier, authToken).then(finish).catch(finish)
        }
        function finish(value: OAuthResult | Error | null) {
          window.clearTimeout(timeout); window.clearInterval(closed)
          window.removeEventListener('message', onMessage)
          if (!authPopup.closed) authPopup.close()
          if (value instanceof Error) reject(value)
          else resolve(value)
        }
        window.addEventListener('message', onMessage)
        authPopup.location.href = start.authorizationUrl!
      })
      if (result) onResult(result)
    } catch { authPopup.close(); onError() }
    finally { setAppleBusy(false) }
  }

  return <div className="social-auth-buttons">
    <span>{t('authFlow.or')}</span>
    {appleReady ? <button className="social-apple-button" disabled={appleBusy} onClick={() => void apple()} type="button">{t('authFlow.apple')}</button> : null}
    {googleReady && config.googleWebClientId ? <GoogleButton clientId={config.googleWebClientId} purpose={purpose} reauthPurpose={reauthPurpose} authToken={authToken} onResult={onResult} onError={onError} /> : null}
  </div>
}
