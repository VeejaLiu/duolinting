import { PropsWithChildren } from 'react'
import { View } from 'react-native'

export function Card({ children }: PropsWithChildren) {
  return (
    <View className="rounded-xl border border-border bg-surface px-4 py-4">
      {children}
    </View>
  )
}
