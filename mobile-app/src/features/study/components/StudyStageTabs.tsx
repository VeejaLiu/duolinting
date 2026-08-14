import { Pressable, Text, View } from 'react-native'
import type { StudyStage } from '@duolinting/domain'
import { useLanguage } from '@/i18n/LanguageProvider'

const studyStages: StudyStage[] = ['extensive', 'intensive', 'review']

export function StudyStageTabs({
  stage,
  onStageChange,
  compact = false,
}: {
  stage: StudyStage
  onStageChange: (stage: StudyStage) => void
  compact?: boolean
}) {
  const { t } = useLanguage()
  const activeStageIndex = studyStages.indexOf(stage)

  return (
    <View className="w-full flex-row overflow-hidden rounded-pill border-2 border-[#1cb0f6] bg-white">
      {studyStages.map((item, index) => {
        const highlighted = index <= activeStageIndex
        const current = index === activeStageIndex
        const isLast = index === studyStages.length - 1

        return (
          <Pressable
            key={item}
            className={`flex-1 items-center justify-center px-2 ${
              current
                ? 'bg-brand'
                : highlighted
                  ? 'bg-[#dff4ff]'
                  : 'bg-white'
            } ${isLast ? '' : 'border-r-2 border-r-[#bde8ff]'}`}
            onPress={() => onStageChange(item)}
            style={{ minHeight: compact ? 46 : 58 }}
          >
            <Text
              className={`text-center font-black ${
                current
                  ? 'text-white'
                  : highlighted
                    ? 'text-brand'
                    : 'text-text-secondary'
              }`}
              numberOfLines={1}
              style={{ fontSize: compact ? 14 : 16 }}
            >
              {index + 1} {item === 'extensive' ? t('study.extensive') : item === 'intensive' ? t('study.intensive') : t('study.difficultSentences')}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
