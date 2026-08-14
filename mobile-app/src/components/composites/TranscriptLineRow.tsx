import type { TranscriptLine } from '@duolinting/domain'
import { Pressable, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

export function TranscriptLineRow({
  compact = false,
  line,
  selected,
  revealed,
  mastered,
  unclear,
  disabled = false,
  onPress,
  visibleIndex,
}: {
  compact?: boolean
  line: TranscriptLine
  selected: boolean
  revealed: boolean
  mastered: boolean
  unclear: boolean
  disabled?: boolean
  onPress: () => void
  visibleIndex?: number
}) {
  const { t } = useLanguage()
  const statusLabel = mastered ? t('study.mastered') : unclear ? t('study.markedDifficult') : ''
  const rowClassName = compact
    ? `min-h-[64px] rounded-[18px] border-2 px-2.5 py-2 ${
        selected
          ? 'border-[#ffd24d] bg-[#fffdf3]'
          : mastered
            ? 'border-[#bde697] bg-[#f7fff0]'
            : 'border-[#e4eef8] bg-white'
      }`
    : `rounded-[18px] border-2 px-4 py-4 ${
        selected ? 'border-brand bg-white' : 'border-[#e4eef8] bg-white'
      }`

  return (
    <Pressable
      className={rowClassName}
      disabled={disabled}
      onPress={onPress}
      style={{
        elevation: compact && selected ? 2 : 0,
        opacity: disabled ? 0.6 : 1,
        shadowColor: compact && selected ? '#f1c232' : 'transparent',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: compact && selected ? 1 : 0,
        shadowRadius: 0,
      }}
    >
      <View className="flex-row items-center justify-between">
        {compact && visibleIndex ? (
          <View className="mr-3 h-[32px] w-[38px] items-center justify-center rounded-[12px] bg-[#edf7ff]">
            <Text className="text-xs font-black text-brand">
              {String(visibleIndex).padStart(2, '0')}
            </Text>
          </View>
        ) : null}
        <Text
          className={`mr-3 flex-1 font-black text-text-primary ${
            compact ? 'text-sm leading-5' : 'text-base leading-6'
          }`}
          numberOfLines={compact ? 2 : revealed ? 3 : 1}
        >
          {revealed ? line.text : compact ? t('study.hiddenChallenge') : t('study.hiddenSubtitle')}
        </Text>
        {compact ? (
          <View className="min-w-[22px] flex-row items-center justify-end gap-1.5">
            {unclear ? (
              <View className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
            ) : null}
            {mastered ? (
              <View className="h-2.5 w-2.5 rounded-full bg-success" />
            ) : null}
          </View>
        ) : statusLabel ? (
          <View
            className={`rounded-pill px-2.5 py-1 ${
              mastered ? 'bg-[#e7f8d9]' : 'bg-[#ffdfE0]'
            }`}
          >
            <Text className="text-[11px] font-black text-text-primary">
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>
      {!compact && revealed ? (
        <Text className="mt-2 text-sm font-bold leading-5 text-text-secondary">
          {line.translation}
        </Text>
      ) : null}
    </Pressable>
  )
}
