type VerificationCallbacks<User> = {
  readToken: () => string
  loadUser: (token: string) => Promise<User>
  onChecking: () => void
  onVerified: (user: User) => void
  onUnavailable: (kind: 'network' | 'server') => void
  onExpired: () => void
}

/** Keep transient service failures separate from an actual rejected session. */
export const createAdminSessionVerifier = <User,>(callbacks: VerificationCallbacks<User>) => {
  // A serial distinguishes overlapping checks even when they use the same token.
  // Token matching also prevents old requests from signing out a newer login.
  let serial = 0
  const expire = (token: string) => {
    if (!token || callbacks.readToken() !== token) return
    serial += 1
    callbacks.onExpired()
  }

  return {
    check: async (token: string) => {
      if (!token || callbacks.readToken() !== token) return
      const requestSerial = ++serial
      const isCurrent = () => requestSerial === serial && callbacks.readToken() === token
      callbacks.onChecking()
      try {
        const user = await callbacks.loadUser(token)
        if (isCurrent()) callbacks.onVerified(user)
      } catch (error) {
        if (!isCurrent()) return
        const status = typeof error === 'object' && error !== null && 'status' in error
          ? Number(error.status) : undefined
        if (status === 401) {
          expire(token)
        } else {
          callbacks.onUnavailable(status === undefined ? 'network' : 'server')
        }
      }
    },
    expire,
    cancel: () => { serial += 1 },
  }
}
