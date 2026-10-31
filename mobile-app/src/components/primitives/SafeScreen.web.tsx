import type { PropsWithChildren } from 'react'
import { View } from 'react-native'
import { useSafeAreaPadding } from '@/hooks/useSafeAreaPadding'

export function SafeScreen({ children }: PropsWithChildren) {
  // Router's web context no longer measures insets in SDK 58. Keep native
  // SafeAreaView in the default file and use browser CSS insets for web only.
  const padding = useSafeAreaPadding({ top: 0, left: 0, right: 0 })
  return <View style={[{ flex: 1 }, padding]}>{children}</View>
}
