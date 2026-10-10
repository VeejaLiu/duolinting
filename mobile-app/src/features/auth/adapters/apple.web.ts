import type { OAuthStartResponse } from '@duolinting/domain'

export async function authorizeApple(start: OAuthStartResponse, preparedPopup?: Window | null, callbackOrigin?: string | null) {
  if (!start.authorizationUrl) throw new Error('Apple authorization is unavailable')
  if (!callbackOrigin) throw new Error('Apple callback origin is unavailable')
  const opened = preparedPopup ?? window.open('', 'duolinting-apple', 'popup,width=520,height=680')
  if (!opened) throw new Error('Browser blocked Apple sign-in')
  const popup: Window = opened
  popup.location.href = start.authorizationUrl
  const expectedOrigin = callbackOrigin
  return new Promise<{ ticket: string } | null>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('Apple sign-in timed out')), 5 * 60 * 1000)
    const closed = window.setInterval(() => { if (popup.closed) finish(null) }, 500)
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin || event.source !== popup || event.data?.type !== 'duolinting-oauth') return
      if (event.data.cancelled === true) { finish(null); return }
      const ticket = event.data.ticket
      finish(typeof ticket === 'string' && ticket.length > 20 ? { ticket } : new Error('Invalid Apple exchange ticket'))
    }
    function finish(result: { ticket: string } | Error | null) {
      window.clearTimeout(timeout); window.clearInterval(closed)
      window.removeEventListener('message', onMessage)
      if (!popup.closed) popup.close()
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    window.addEventListener('message', onMessage)
  })
}
