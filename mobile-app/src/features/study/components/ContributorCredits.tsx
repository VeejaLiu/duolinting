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
    <View className="gap-1 border-b-2 border-[#d7e4ef] bg-white px-5 py-2">
      {responsibilities.length > 0 && <Text className="text-xs font-bold text-text-muted">
        本课协作 · {responsibilities.join(' · ')}
      </Text>}
      {contributors?.length ? <Text className="text-xs font-bold text-text-muted">
        贡献者 · {contributors.map((contributor) => `${contributor.displayName}（${contributor.roles.map((role) => roleLabels[role] ?? role).join('、')}）`).join(' · ')}
      </Text> : null}
    </View>
  )
}
