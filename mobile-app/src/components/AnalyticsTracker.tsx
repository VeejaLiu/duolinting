import { useEffect } from 'react'
import { usePathname } from 'expo-router'
import { Platform, AppState } from 'react-native'
import { webAttribution } from '@duolinting/analytics/web'
import { analytics, clearLegacyAnalyticsChoice } from '@/lib/analytics'
import { useAuthStore } from '@/stores/authStore'

export function AnalyticsTracker() {
  const path = usePathname()
  const token = useAuthStore((state) => state.authToken)
  const owner = useAuthStore((state) => state.authUser?.id)
  const authReady = useAuthStore((state) => state.authReady)
  const analyticsOwner = owner ? String(owner) : 'anonymous'

  useEffect(() => {
    if (owner && token) void clearLegacyAnalyticsChoice(String(owner)).catch(() => undefined)
  }, [owner, token])

  useEffect(() => {
    if (!authReady) return
    // First-party analysis runs by default after session recovery, including
    // the authentication screen under an anonymous identity.
    void analytics.configure(true, token, analyticsOwner, Platform.OS === 'web' ? webAttribution() : undefined)
      .then(() => {
        const current = useAuthStore.getState()
        const currentOwner = current.authUser ? String(current.authUser.id) : 'anonymous'
        if (current.authReady && currentOwner === analyticsOwner && current.authToken === token) analytics.page(path)
      })
  }, [authReady, analyticsOwner, token, path])

  useEffect(() => {
    const timer = setInterval(() => void analytics.flush(), 15_000)
    // Native backgrounding does not dispatch browser pagehide. Persist and
    // attempt the final outbox delivery before the OS suspends JS timers.
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void analytics.flush()
    })
    return () => { clearInterval(timer); listener.remove() }
  }, [])
  return null
}
