import type { AuthResponse, AuthUser } from '@duolinting/domain'
import { create } from 'zustand'
import { authStorage } from '@/services/authStorage'
import { apiClient } from '@/lib/apiClient'
import type { MessageKey } from '@/i18n/messages'

export type AccountStatusKey = Extract<MessageKey, `account.${string}`>

type AuthStoreState = {
  authToken: string
  authUser: AuthUser | null
  authReady: boolean
  accountStatus: AccountStatusKey
  setAccountStatus: (status: AccountStatusKey) => void
  restoreSession: () => Promise<void>
  applyAuthenticated: (response: AuthResponse) => Promise<void>
  expireSession: (message?: AccountStatusKey) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  authToken: '',
  authUser: null,
  authReady: false,
  accountStatus: 'account.restoring',
  setAccountStatus: (accountStatus) => set({ accountStatus }),
  restoreSession: async () => {
    const token = await authStorage.getToken()
    if (!token) {
      set({
        authToken: '',
        authUser: null,
        authReady: true,
        accountStatus: 'account.notLoggedIn',
      })
      return
    }

    try {
      const user = await apiClient.getCurrentUser(token)
      set({
        authToken: token,
        authUser: user,
        authReady: true,
        accountStatus: 'account.signedIn',
      })
    } catch (error) {
      await authStorage.clearToken()
      set({
        authToken: '',
        authUser: null,
        authReady: true,
        accountStatus: 'account.sessionExpired',
      })
    }
  },
  applyAuthenticated: async (response) => {
    await authStorage.setToken(response.token)
    set({
      authToken: response.token,
      authUser: response.user,
      authReady: true,
      accountStatus: 'account.signedIn',
    })
  },
  expireSession: async (message = 'account.sessionExpired') => {
    await authStorage.clearToken()
    set({
      authToken: '',
      authUser: null,
      authReady: true,
      accountStatus: message,
    })
  },
  logout: async () => {
    await authStorage.clearToken()
    set({
      authToken: '',
      authUser: null,
      authReady: true,
      accountStatus: 'account.notLoggedIn',
    })
  },
}))
