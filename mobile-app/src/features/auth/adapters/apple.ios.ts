import * as AppleAuthentication from 'expo-apple-authentication'
import type { OAuthStartResponse } from '@duolinting/domain'

export async function authorizeApple(start: OAuthStartResponse) {
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
