import { View } from 'react-native'

export function ProgressBar({ percent }: { percent: number }) {
  const safePercent = Math.max(0, Math.min(100, percent))
  return (
    <View className="h-3 overflow-hidden rounded-pill bg-surface-raised">
      <View
        className="h-full rounded-pill bg-success"
        style={{ width: `${safePercent}%` }}
      />
    </View>
  )
}
