import type { OAuthStartResponse } from '@duolinting/domain'

// Metro resolves .ios/.android/.web before this fallback.
export async function authorizeApple(_start: OAuthStartResponse, _popup?: Window | null, _callbackOrigin?: string | null): Promise<{ idToken?: string; authorizationCode?: string; ticket?: string } | null> {
  throw new Error('Apple authentication is unavailable on this platform')
}
