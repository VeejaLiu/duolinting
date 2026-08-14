import { Text, View } from 'react-native'

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <View className="items-center rounded-xl border border-dashed border-border bg-surface-subtle px-5 py-8">
      <Text className="text-lg font-semibold text-text-primary">{title}</Text>
      <Text className="mt-2 text-center text-sm text-text-secondary">
        {description}
      </Text>
    </View>
  )
}
