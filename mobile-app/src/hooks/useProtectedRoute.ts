import { useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useNavigationStore } from '@/stores/navigationStore'

const RETURN_QUERY_KEYS = [
  'seriesId',
  'stage',
  'from',
  'utm_source',
  'utm_medium',
  'utm_campaign',
] as const

/** Preserve useful deep-link context through login without copying arbitrary query data. */
function buildPendingPath(pathname: string, params: Record<string, unknown>) {
  const query = RETURN_QUERY_KEYS.flatMap((key) => {
    const value = params[key]
    return typeof value === 'string' && value.length <= 128
      ? [`${encodeURIComponent(key)}=${encodeURIComponent(value)}`]
      : []
  }).join('&')

  return query ? `${pathname}?${query}` : pathname
}

export function useProtectedRoute() {
  const router = useRouter()
  const segments = useSegments()
  const pathname = usePathname()
  const searchParams = useGlobalSearchParams()
  const authReady = useAuthStore((state) => state.authReady)
  const authUser = useAuthStore((state) => state.authUser)
  const savedPendingPath = useNavigationStore((state) => state.pendingPath)
  const setPendingPath = useNavigationStore((state) => state.setPendingPath)
  const pendingPath = buildPendingPath(pathname, searchParams)

  useEffect(() => {
    if (!authReady) {
      return
    }

    const inAuthGroup = segments[0] === 'auth'
    // 贡献页是公开联系入口，游客也应能从“我的”页或外部链接直接进入。
    const isPublicRoute = inAuthGroup || segments[0] === 'contribute'
    if (!authUser && !isPublicRoute) {
      setPendingPath(pendingPath)
      router.replace('/auth/login')
      return
    }

    if (authUser && inAuthGroup) {
      // The login screen also completes this navigation after the request resolves;
      // using the same saved destination here prevents its auth redirect from
      // replacing a deep link with the default tab.
      router.replace(savedPendingPath ?? '/(tabs)')
      return
    }

    if (authUser && savedPendingPath && pathname === savedPendingPath.split('?')[0]) {
      setPendingPath(null)
    }
  }, [authReady, authUser, pathname, pendingPath, router, savedPendingPath, segments, setPendingPath])
}
