import { FontAwesome6 } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import type { CourseContributor, CourseWorkflowCredits } from '@duolinting/domain'
import { useLanguage } from '@/i18n/LanguageProvider'
import { ContributorCredits } from './ContributorCredits'

export function StudyHeader({
  title,
  onBack,
  compact = false,
  contributors,
  workflowCredits,
}: {
  title: string
  onBack: () => void
  compact?: boolean
  contributors?: CourseContributor[]
  workflowCredits?: CourseWorkflowCredits
}) {
  const { t } = useLanguage()

  return (
    <View
      className="border-b-2 border-[#d7e4ef] bg-white px-4"
      style={{
        paddingBottom: compact ? 10 : 16,
        paddingTop: compact ? 8 : 12,
        shadowColor: '#9bb8d3',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
        elevation: 4,
        zIndex: 1,
      }}
    >
      <View className="flex-row items-center">
        <Pressable
          accessibilityLabel={t('common.back')}
          className="items-center justify-center rounded-[16px] border-2 border-[#d7e2ee] border-b-[4px] border-b-[#d7e4ef] bg-white"
          onPress={onBack}
          style={{
            height: compact ? 38 : 44,
            width: compact ? 38 : 44,
          }}
        >
          <FontAwesome6 color="#172033" name="chevron-left" size={16} />
        </Pressable>
        <View className="ml-3 flex-1">
          <Text
            className="font-black text-text-primary"
            numberOfLines={compact ? 1 : 2}
            style={{ fontSize: compact ? 17 : 20 }}
          >
            {title}
          </Text>
          <ContributorCredits
            contributors={contributors}
            workflowCredits={workflowCredits}
          />
        </View>
      </View>
    </View>
  )
}
