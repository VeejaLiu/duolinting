import { Text, View } from 'react-native'
import type { CourseContributor, CourseWorkflowCredits } from '@duolinting/domain'

const roleLabels: Record<string, string> = {
  proofreader: '校对',
  second_reviewer: '二次审核',
}

export function ContributorCredits({
  contributors,
  workflowCredits,
}: {
  contributors?: CourseContributor[]
  workflowCredits?: CourseWorkflowCredits
}) {
  const responsibilities = [
    workflowCredits?.proofreaderDisplayName && `校对负责人 · ${workflowCredits.proofreaderDisplayName}`,
    workflowCredits?.secondReviewerDisplayName && `二次审核 · ${workflowCredits.secondReviewerDisplayName}`,
  ].filter(Boolean)

  if (!contributors?.length && responsibilities.length === 0) return null
  return (
    <View className="mt-1.5 flex-row flex-wrap gap-1.5">
      {responsibilities.map((responsibility) => (
        <View className="rounded-full border border-[#bce8fc] bg-[#e9f8ff] px-2 py-1" key={responsibility}>
          <Text className="text-[11px] font-extrabold text-[#168bc0]">{responsibility}</Text>
        </View>
      ))}
      {contributors?.map((contributor) => (
        <View className="rounded-full border border-[#d8e6f1] bg-[#f5faff] px-2 py-1" key={contributor.displayName}>
          <Text className="text-[11px] font-extrabold text-text-muted">
            {`贡献 · ${contributor.displayName}（${contributor.roles.map((role) => roleLabels[role] ?? role).join('、')}）`}
          </Text>
        </View>
      ))}
    </View>
  )
}
