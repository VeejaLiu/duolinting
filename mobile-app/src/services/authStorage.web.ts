import { MOBILE_WEB_AUTH_TOKEN_STORAGE_KEY } from '@duolinting/app-config'

const webStorage = {
  getItem(key: string) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }

    return window.localStorage.getItem(key)
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    window.localStorage.setItem(key, value)
  },
  removeItem(key: string) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    window.localStorage.removeItem(key)
  },
}

/**
 * Web builds must avoid importing `expo-secure-store` entirely.
 * Expo's web shim can expose incomplete native-only methods in some runtimes,
 * which breaks session restore before the platform branch even helps.
 * This file is resolved only on web, so auth persistence stays browser-safe.
 */
export const authStorage = {
  async getToken() {
    return webStorage.getItem(MOBILE_WEB_AUTH_TOKEN_STORAGE_KEY)
  },
  async setToken(token: string) {
    webStorage.setItem(MOBILE_WEB_AUTH_TOKEN_STORAGE_KEY, token)
  },
  async clearToken() {
    webStorage.removeItem(MOBILE_WEB_AUTH_TOKEN_STORAGE_KEY)
  },
}
