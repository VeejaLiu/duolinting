import * as SecureStore from 'expo-secure-store'
import { AUTH_TOKEN_STORAGE_KEY } from '@duolinting/app-config'

/**
 * Native builds use the OS-backed secure keystore.
 * The token format is the backend-issued auth token string with no extra JSON
 * wrapping, so both native and web restore paths operate on the same payload.
 */
export const authStorage = {
  async getToken() {
    return SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY)
  },
  async setToken(token: string) {
    await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, token)
  },
  async clearToken() {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY)
  },
}
