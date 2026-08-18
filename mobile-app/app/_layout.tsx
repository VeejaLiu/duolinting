import '../global.css'
import { SplashScreen, Stack } from 'expo-router'
import { useEffect } from 'react'
import { AppProviders } from '@/providers/AppProviders'
import { useRemoteProgressSync } from '@/features/progress/hooks'
import { useBootstrapSession } from '@/hooks/useBootstrapSession'
import { useBootstrapStudyStore } from '@/hooks/useBootstrapStudyStore'
import { useProtectedRoute } from '@/hooks/useProtectedRoute'
import { useAuthStore } from '@/stores/authStore'
import { RuntimeErrorBoundary } from '@/components/foundation/RuntimeErrorBoundary'
import { installRuntimeErrorReporting } from '@/lib/runtimeErrorReporting'
import { useLanguage } from '@/i18n/LanguageProvider'

SplashScreen.preventAutoHideAsync().catch(() => undefined)
installRuntimeErrorReporting()

function RootNavigator() {
  useBootstrapSession()
  useProtectedRoute()
  // 本地快照先 hydrate，再由云端同步按既有逻辑覆盖（详见 hook 注释）
  useBootstrapStudyStore()
  useRemoteProgressSync()
  const authReady = useAuthStore((state) => state.authReady)
  const { languageReady } = useLanguage()

  useEffect(() => {
    if (authReady && languageReady) {
      void SplashScreen.hideAsync()
    }
  }, [authReady, languageReady])

  useEffect(() => {
    // Secure storage and the network are best-effort startup enhancements, not
    // prerequisites for rendering the app. If either platform API stalls, the
    // default in-memory state can safely render while it finishes or retries.
    const splashSafetyTimer = setTimeout(() => {
      void SplashScreen.hideAsync()
    }, 2_500)

    return () => clearTimeout(splashSafetyTimer)
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth/login" />
      {/* 系列选择器是完整页面，从右侧推进并在返回时反向滑出。 */}
      <Stack.Screen
        name="series/index"
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="settings"
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="settings/change-password"
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="contribute"
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen name="study/[seriesId]/[exerciseId]" />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RuntimeErrorBoundary>
        <RootNavigator />
      </RuntimeErrorBoundary>
    </AppProviders>
  )
}
