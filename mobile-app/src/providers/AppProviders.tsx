import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { PropsWithChildren, useState } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { LanguageProvider } from '@/i18n/LanguageProvider'

// 目录查询键现在包含 contentLocale。换 key 避免旧版仅中文的持久化缓存
// 在升级后被当作当前语言的数据复用；学习进度和认证存储不受此变更影响。
const QUERY_CACHE_STORAGE_KEY = 'duolinting.mobile.query-cache.v3'

const webQueryPersister = {
  persistClient: async (client: unknown) => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    window.localStorage.setItem(
      QUERY_CACHE_STORAGE_KEY,
      JSON.stringify(client),
    )
  },
  restoreClient: async () => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return undefined
    }

    const rawValue = window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY)
    if (!rawValue) {
      return undefined
    }

    try {
      return JSON.parse(rawValue)
    } catch {
      window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY)
      return undefined
    }
  },
  removeClient: async () => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY)
  },
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 1000 * 60 * 60,
            retry: 1,
          },
        },
      }),
  )
  const [queryPersister] = useState(() =>
    Platform.OS === 'web'
      ? webQueryPersister
      : createAsyncStoragePersister({
          storage: AsyncStorage,
          key: QUERY_CACHE_STORAGE_KEY,
        }),
  )

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister }}
        >
          <LanguageProvider>
            <StatusBar style="dark" />
            {children}
          </LanguageProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
