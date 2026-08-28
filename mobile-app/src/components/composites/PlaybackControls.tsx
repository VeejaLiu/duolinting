import { Pressable, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

export function PlaybackControls({
  isPlaying,
  onPlayPause,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  playLabel,
  pauseLabel,
}: {
  isPlaying: boolean
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  prevLabel?: string
  nextLabel?: string
  playLabel?: string
  pauseLabel?: string
}) {
  const { t } = useLanguage()
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Pressable className="rounded-pill bg-surface-raised px-4 py-3" onPress={onPrev}>
        <Text className="font-semibold text-text-primary">{prevLabel ?? t('study.previous')}</Text>
      </Pressable>
      <Pressable className="rounded-pill bg-brand px-5 py-3" onPress={onPlayPause}>
        <Text className="font-semibold text-white">
          {isPlaying ? pauseLabel ?? t('study.pause') : playLabel ?? t('study.play')}
        </Text>
      </Pressable>
      <Pressable className="rounded-pill bg-surface-raised px-4 py-3" onPress={onNext}>
        <Text className="font-semibold text-text-primary">{nextLabel ?? t('study.next')}</Text>
      </Pressable>
    </View>
  )
}
