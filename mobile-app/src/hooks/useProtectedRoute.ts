import { useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useNavigationStore } from '@/stores/navigationStore'

export function useProtectedRoute() {
  const router = useRouter()
  const segments = useSegments()
  const authReady = useAuthStore((state) => state.authReady)
  const authUser = useAuthStore((state) => state.authUser)
  const setPendingPath = useNavigationStore((state) => state.setPendingPath)

  useEffect(() => {
    if (!authReady) {
      return
    }

    const inAuthGroup = segments[0] === 'auth'
    // 贡献页是公开联系入口，游客也应能从“我的”页或外部链接直接进入。
    const isPublicRoute = inAuthGroup || segments[0] === 'contribute'
    if (!authUser && !isPublicRoute) {
      const nextPath = `/${segments.join('/')}`
      setPendingPath(nextPath)
      router.replace('/auth/login')
      return
    }

    if (authUser && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [authReady, authUser, router, segments, setPendingPath])
}
