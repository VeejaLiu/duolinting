export const ENV_KEYS = {
  webApiBaseUrl: 'VITE_API_BASE_URL',
  mobileApiBaseUrl: 'EXPO_PUBLIC_API_BASE_URL',
} as const

export const AUTH_TOKEN_STORAGE_KEY = 'duolinting.authToken.v1'
export const MOBILE_WEB_AUTH_TOKEN_STORAGE_KEY = 'duolinting.mobileWebAuthToken.v1'

export const FEATURE_FLAGS = {
  appleLogin: false,
  googleLogin: false,
} as const

export type AppRuntimeConfig = {
  apiBaseUrl: string
  authTokenStorageKey: string
  featureFlags: typeof FEATURE_FLAGS
}

const isBrowserRuntime = () => 'window' in globalThis

export const normalizeApiBaseUrl = (
  value: string | undefined | null,
  options?: {
    isBrowser?: boolean
  },
) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) {
    const isBrowser = options?.isBrowser ?? isBrowserRuntime()
    /*
     * Empty browser base means "same origin": API calls like /api/v1/catalog are sent to
     * the current web/admin/mobile host, then each frontend nginx container proxies /api/
     * to backend. This avoids baking 127.0.0.1 into production bundles, where 127.0.0.1
     * would mean the learner's own device instead of the server. The non-browser fallback is
     * kept only for local Node-side tooling or tests.
     */
    return isBrowser ? '' : 'http://127.0.0.1:8100'
  }

  return trimmed.replace(/\/+$/, '')
}

export const createAppRuntimeConfig = (
  partial?: Partial<Pick<AppRuntimeConfig, 'apiBaseUrl'>>,
): AppRuntimeConfig => ({
  apiBaseUrl: normalizeApiBaseUrl(partial?.apiBaseUrl),
  authTokenStorageKey: AUTH_TOKEN_STORAGE_KEY,
  featureFlags: FEATURE_FLAGS,
})
