import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useNavigationStore } from '@/stores/navigationStore'

const returnKeys = ['seriesId', 'stage', 'from', 'utm_source', 'utm_medium', 'utm_campaign'] as const
const safeDestination = (pathname: string) =>
  pathname.startsWith('/') && pathname !== '/' && !pathname.startsWith('//') &&
  !pathname.startsWith('/auth') &&
  !pathname.startsWith('/settings/account/delete') &&
  !pathname.startsWith('/settings/account/change-password') &&
  !pathname.startsWith('/settings/change-password')

function pendingPath(pathname: string, params: Record<string, unknown>) {
  if (!safeDestination(pathname)) return null
  const query = returnKeys.flatMap((key) => {
    const value = params[key]
    return typeof value === 'string' && value.length <= 128
      ? [`${encodeURIComponent(key)}=${encodeURIComponent(value)}`] : []
  }).join('&')
  return query ? `${pathname}?${query}` : pathname
}

/** Protected Stack guards block rendering; this hook only remembers safe deep links. */
export function useProtectedRoute() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const user = useAuthStore((state) => state.authUser)
  const authReady = useAuthStore((state) => state.authReady)
  const saved = useNavigationStore((state) => state.pendingPath)
  const setPending = useNavigationStore((state) => state.setPendingPath)
  const wasSignedIn = useRef(false)
  if (user) wasSignedIn.current = true

  useEffect(() => {
    void Linking.parseInitialURLAsync().then((initial) => {
      if (!initial.path || useAuthStore.getState().authUser || useNavigationStore.getState().pendingPath || wasSignedIn.current) return
      const route = `/${initial.path.replace(/^\/+/, '')}`
      if (!/^\/(settings|series|study|vocabulary|contribute)(\/|$)/.test(route)) return
      const destination = pendingPath(route, initial.queryParams ?? {})
      if (destination) setPending(destination)
    }).catch(() => undefined)
  }, [setPending])

  useEffect(() => {
    if (user || wasSignedIn.current || saved || pathname === '/auth/login') return
    const destination = pendingPath(pathname, params)
    if (destination) setPending(destination)
  }, [user, saved, pathname, params, setPending])

  useEffect(() => {
    if (!authReady || !user || !saved) return
    if (!safeDestination(saved.split('?')[0])) {
      setPending(null)
      return
    }
    if (pathname === saved.split('?')[0]) {
      setPending(null)
    } else {
      router.replace(saved as '/(tabs)')
    }
  }, [authReady, user, saved, pathname, router, setPending])
}
