import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, type PropsWithChildren } from 'react'
import { Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { ToastProvider } from './ToastProvider'
import { registerSessionQueryClient } from '@/services/sessionCoordinator'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 60 * 60 * 1000, retry: 1 } },
})
registerSessionQueryClient(queryClient)
const legacyQueryKeys = [
  'duolinting.mobile.query-cache.v1',
  'duolinting.mobile.query-cache.v2',
  'duolinting.mobile.query-cache.v3',
]

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    // v3 persisted successful private queries, including token-bearing keys.
    // Retire it before a restored result can enter another account's memory.
    if (Platform.OS === 'web') {
      try { legacyQueryKeys.forEach((key) => window.localStorage.removeItem(key)) } catch { /* private mode */ }
    } else {
      void AsyncStorage.multiRemove(legacyQueryKeys).catch(() => undefined)
    }
  }, [])
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              {children}
            </ToastProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
