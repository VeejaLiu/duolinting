import * as AppleAuthentication from 'expo-apple-authentication'
import type { OAuthStartResponse } from '@duolinting/domain'

// All platform adapters share this credential shape; an iOS credential has
// tokens while the browser/Android redirect has a one-time exchange ticket.
export async function authorizeApple(start: OAuthStartResponse, _popup?: Window | null, _callbackOrigin?: string | null): Promise<{ idToken?: string; authorizationCode?: string; ticket?: string } | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      nonce: start.nonce,
      state: start.state,
    })
    if (credential.state !== start.state || !credential.identityToken || !credential.authorizationCode) throw new Error('Apple authorization was incomplete')
    return { idToken: credential.identityToken, authorizationCode: credential.authorizationCode }
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && String(error.code) === 'ERR_REQUEST_CANCELED') return null
    throw error
  }
}
