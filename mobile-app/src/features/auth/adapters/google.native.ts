import { GoogleOneTapSignIn, isCancelledResponse, isSuccessResponse } from 'react-native-nitro-google-signin'
import type { OAuthStartResponse } from '@duolinting/domain'

export async function authorizeGoogle(start: OAuthStartResponse, webClientId: string, iosClientId?: string | null) {
  GoogleOneTapSignIn.configure({ webClientId, iosClientId: iosClientId ?? undefined, nonce: start.nonce, offlineAccess: false })
  await GoogleOneTapSignIn.checkPlayServices()
  const result = await GoogleOneTapSignIn.presentExplicitSignIn()
  if (isCancelledResponse(result)) return null
  if (!isSuccessResponse(result) || !result.data.idToken) throw new Error('Google did not return an ID token')
  return { idToken: result.data.idToken }
}
