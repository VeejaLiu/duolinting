import type { OAuthStartResponse } from '@duolinting/domain'

// Metro resolves .native/.web before this fallback.
export async function authorizeGoogle(_start: OAuthStartResponse, _webClientId: string, _iosClientId?: string | null): Promise<{ idToken: string } | null> {
  throw new Error('Google authentication is unavailable on this platform')
}
