import type { AuthResponse, AuthUser } from '@duolinting/domain'
import { ApiClientError } from '@duolinting/api-client'
import { create } from 'zustand'
import { authStorage } from '@/services/authStorage'
import { completePendingAccountCleanup, endLearnerSession, saveSessionSnapshot } from '@/services/sessionCoordinator'
import { apiClient } from '@/lib/apiClient'
import type { MessageKey } from '@/i18n/messages'

export type AccountStatusKey = Extract<MessageKey, `account.${string}`>
const SESSION_RESTORE_TIMEOUT_MS = 8_000
let restoreGeneration = 0
const withTimeout = <T>(operation: Promise<T>) => Promise.race([
  operation,
  new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Session restore timed out')), SESSION_RESTORE_TIMEOUT_MS)),
])

type State = {
  authToken: string
  authUser: AuthUser | null
  authReady: boolean
  authRecoveryError: boolean
  accountStatus: AccountStatusKey
  setAccountStatus: (status: AccountStatusKey) => void
  restoreSession: () => Promise<void>
  applyAuthenticated: (response: AuthResponse) => Promise<void>
  expireSession: (message?: AccountStatusKey) => Promise<void>
  logout: () => Promise<void>
  finishDeletedAccount: () => Promise<void>
}

export const useAuthStore = create<State>((set, get) => ({
  authToken: '', authUser: null, authReady: false, authRecoveryError: false,
  accountStatus: 'account.restoring',
  setAccountStatus: (accountStatus) => set({ accountStatus }),
  restoreSession: async () => {
    const version = ++restoreGeneration
    set({ authReady: false, authRecoveryError: false, accountStatus: 'account.restoring' })
    try { await completePendingAccountCleanup() } catch { /* Retry next launch. */ }
    let token: string | null
    try { token = await withTimeout(authStorage.getToken()) } catch {
      if (version === restoreGeneration) set({ authReady: true, authRecoveryError: true, accountStatus: 'account.cloudLoadFailed' })
      return
    }
    if (version !== restoreGeneration) return
    if (!token) {
      set({ authToken: '', authUser: null, authReady: true, accountStatus: 'account.notLoggedIn' })
      return
    }
    try {
      const user = await withTimeout(apiClient.getCurrentUser(token))
      if (version !== restoreGeneration) return
      set({ authToken: token, authUser: user, authReady: true, authRecoveryError: false, accountStatus: 'account.signedIn' })
    } catch (error) {
      if (version !== restoreGeneration) return
      if (error instanceof ApiClientError && error.status === 401) {
        try { await authStorage.clearToken() } catch { /* The next restore will retry validation. */ }
        set({ authToken: '', authUser: null, authReady: true, accountStatus: 'account.sessionExpired' })
      } else {
        // A timeout or network error does not prove the saved session is invalid.
        set({ authToken: '', authUser: null, authReady: true, authRecoveryError: true, accountStatus: 'account.cloudLoadFailed' })
      }
    }
  },
  applyAuthenticated: async (response) => {
    ++restoreGeneration
    await authStorage.setToken(response.token)
    set({ authToken: response.token, authUser: response.user, authReady: true, authRecoveryError: false, accountStatus: 'account.signedIn' })
  },
  expireSession: async (message = 'account.sessionExpired') => {
    ++restoreGeneration
    const owner = get().authUser ? String(get().authUser!.id) : null
    const cleanup = endLearnerSession(owner, false)
    set({ authToken: '', authUser: null, authReady: false })
    try { await cleanup } catch { /* A storage error cannot reopen the session. */ }
    try { await authStorage.clearToken() } catch { /* A stale token is rejected on next restore. */ } finally {
      set({ authReady: true, authRecoveryError: false, accountStatus: message })
    }
  },
  logout: async () => {
    const owner = get().authUser ? String(get().authUser!.id) : null
    // Keep the session if either durable snapshot or credential removal fails.
    if (owner) await saveSessionSnapshot(owner)
    const token = get().authToken
    if (token) {
      try { await apiClient.logout(token) }
      catch (error) {
        // An already invalid session needs only local cleanup. Network errors
        // leave it intact so the user can retry a real server-side logout.
        if (!(error instanceof ApiClientError && error.status === 401)) throw error
      }
    }
    ++restoreGeneration
    await authStorage.clearToken()
    set({ authToken: '', authUser: null, authReady: false })
    try { await endLearnerSession(owner, false, true) } finally {
      set({ authReady: true, authRecoveryError: false, accountStatus: 'account.notLoggedIn' })
    }
  },
  finishDeletedAccount: async () => {
    ++restoreGeneration
    const owner = get().authUser ? String(get().authUser!.id) : null
    const cleanup = endLearnerSession(owner, true)
    set({ authToken: '', authUser: null, authReady: false })
    try { await cleanup } catch { /* Server deletion remains successful. */ }
    try { await authStorage.clearToken() } catch { /* The deleted server account cannot be restored. */ } finally {
      set({ authReady: true, authRecoveryError: false, accountStatus: 'account.notLoggedIn' })
    }
  },
}))
