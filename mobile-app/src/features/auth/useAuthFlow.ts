import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import type { OAuthConfig, OAuthProvider, OAuthPurpose, OAuthResult, ReauthPurpose } from '@duolinting/domain'
import { apiClient } from '@/lib/apiClient'
import { useAuthStore } from '@/stores/authStore'
import { authorizeApple } from './adapters/apple'
import { authorizeGoogle } from './adapters/google'

const createVerifier = () => Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join('')

export function useAuthFlow() {
  const [config, setConfig] = useState<OAuthConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const authToken = useAuthStore((state) => state.authToken)
  const applyAuthenticated = useAuthStore((state) => state.applyAuthenticated)

  useEffect(() => {
    let active = true
    void apiClient.getOAuthConfig().then((value) => { if (active) setConfig(value) }).catch(() => { if (active) setConfig(null) })
    return () => { active = false }
  }, [])

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web'
  const localGoogleReady = Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID && (platform === 'web' || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID))
  const appleReady = platform === 'ios'
    ? config?.enabled.appleNative === true && process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED === 'true'
    : config?.enabled.appleWeb === true && Boolean(config.appleCallbackOrigin)
  const googleReady = localGoogleReady && Boolean(config?.enabled[platform === 'ios' ? 'googleIos' : platform === 'android' ? 'googleAndroid' : 'googleWeb'])
  // iOS releases present both equivalent choices together after native config.
  const providers: OAuthProvider[] = platform === 'ios'
    ? appleReady && googleReady ? ['apple', 'google'] : []
    : [ ...(googleReady ? ['google' as const] : []), ...(appleReady ? ['apple' as const] : []) ]

  const run = async (provider: OAuthProvider, purpose: OAuthPurpose = 'login', reauthPurpose?: ReauthPurpose): Promise<OAuthResult | null> => {
    if (busy || !config || !providers.includes(provider)) return null
    setBusy(true)
    const popup = provider === 'apple' && platform === 'web' ? window.open('', 'duolinting-apple', 'popup,width=520,height=680') : null
    try {
      const verifier = provider === 'apple' && platform !== 'ios' ? createVerifier() : undefined
      const start = await apiClient.startOAuth({ provider, purpose, platform, reauthPurpose, verifier, returnOrigin: platform === 'web' ? window.location.origin : undefined }, purpose === 'login' ? undefined : authToken)
      const credential = provider === 'apple'
        ? await authorizeApple(start, popup, config.appleCallbackOrigin)
        : await authorizeGoogle(start, config.googleWebClientId ?? '', config.googleIosClientId)
      if (!credential) return null
      const result = 'ticket' in credential && credential.ticket
        ? await apiClient.exchangeOAuth(credential.ticket, verifier ?? '', purpose === 'login' ? undefined : authToken)
        : await apiClient.completeOAuth({ transactionId: start.transactionId, idToken: credential.idToken, authorizationCode: 'authorizationCode' in credential ? credential.authorizationCode : undefined }, purpose === 'login' ? undefined : authToken)
      if (result.status === 'authenticated') await applyAuthenticated(result.auth)
      return result
    } catch (error) {
      if (popup && !popup.closed) popup.close()
      throw error
    } finally { setBusy(false) }
  }

  return { providers, busy, run }
}
