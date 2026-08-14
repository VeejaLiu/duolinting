import { Text, View } from 'react-native'

export function SyncStatusCard({
  title,
  detail,
  tone = 'neutral',
}: {
  title: string
  detail: string
  tone?: 'neutral' | 'success' | 'danger'
}) {
  const titleClassName =
    tone === 'success'
      ? 'font-semibold text-success'
      : tone === 'danger'
        ? 'font-semibold text-danger'
        : 'font-semibold text-text-primary'

  return (
    <View className="rounded-xl border border-border bg-surface px-4 py-4">
      <Text className={titleClassName}>{title}</Text>
      <Text className="mt-2 text-sm text-text-secondary">{detail}</Text>
    </View>
  )
}
