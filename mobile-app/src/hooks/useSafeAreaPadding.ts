import { Platform } from 'react-native'
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context'
import { createSafeAreaPadding } from '@/lib/safeAreaPadding'

export function useSafeAreaPadding(offsets: Partial<EdgeInsets>) {
  return createSafeAreaPadding(useSafeAreaInsets(), offsets, Platform.OS === 'web')
}
