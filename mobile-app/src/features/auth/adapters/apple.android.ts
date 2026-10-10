import * as WebBrowser from 'expo-web-browser'
import type { OAuthStartResponse } from '@duolinting/domain'

export async function authorizeApple(start: OAuthStartResponse, _popup?: Window | null, _callbackOrigin?: string | null): Promise<{ idToken?: string; authorizationCode?: string; ticket?: string } | null> {
  if (!start.authorizationUrl) throw new Error('Apple authorization is unavailable')
  const result = await WebBrowser.openAuthSessionAsync(start.authorizationUrl, 'duolinting://oauth')
  if (result.type === 'cancel' || result.type === 'dismiss') return null
  if (result.type !== 'success' || !result.url.startsWith('duolinting://oauth?')) throw new Error('Apple authorization did not return to DuolinTing')
  if (new URL(result.url).searchParams.has('cancelled')) return null
  const ticket = new URL(result.url).searchParams.get('ticket')
  if (!ticket) throw new Error('Apple exchange ticket is missing')
  return { ticket }
}
