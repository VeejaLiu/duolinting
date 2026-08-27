import type {
  CourseContributionRole,
  CourseContributor,
  CourseWorkflowCredits,
} from '@duolinting/domain'
import { Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'
import type { MessageKey } from '@/i18n/messages'

const roleLabels: Record<CourseContributionRole, MessageKey> = {
  proofreader: 'study.credits.proofreaderRole',
  second_reviewer: 'study.credits.secondReviewerRole',
}

export function ContributorCredits({
  contributors,
  workflowCredits,
}: {
  contributors?: CourseContributor[]
  workflowCredits?: CourseWorkflowCredits
}) {
  const { t } = useLanguage()
  const contributorByName = new Map<string, CourseContributor>()

  for (const contributor of contributors ?? []) {
    const existingContributor = contributorByName.get(contributor.displayName)
    contributorByName.set(contributor.displayName, {
      ...contributor,
      // 同一公开署名可能同时完成多个协作环节，只保留一个徽章并合并角色。
      roles: existingContributor
        ? [...new Set([...existingContributor.roles, ...contributor.roles])]
        : [...new Set(contributor.roles)],
    })
  }

  const responsibilities: string[] = []
  const workflowAssignments: Array<{
    displayName?: string
    label: MessageKey
    role: CourseContributionRole
  }> = [
    {
      displayName: workflowCredits?.proofreaderDisplayName,
      label: 'study.credits.proofreader',
      role: 'proofreader',
    },
    {
      displayName: workflowCredits?.secondReviewerDisplayName,
      label: 'study.credits.secondReviewer',
      role: 'second_reviewer',
    },
  ]

  for (const assignment of workflowAssignments) {
    if (!assignment.displayName) continue
    const existingContributor = contributorByName.get(assignment.displayName)
    if (existingContributor) {
      existingContributor.roles = [
        ...new Set([...existingContributor.roles, assignment.role]),
      ]
      continue
    }
    responsibilities.push(t(assignment.label, { name: assignment.displayName }))
  }

  if (contributorByName.size === 0 && responsibilities.length === 0) return null

  return (
    <View
      accessible
      accessibilityLabel={t('study.credits.aria')}
      className="mt-1.5 flex-row flex-wrap gap-1.5"
    >
      {responsibilities.map((responsibility) => (
        <View
          className="rounded-full border border-[#bce8fc] bg-[#e9f8ff] px-2 py-1"
          key={responsibility}
        >
          <Text className="text-[11px] font-extrabold text-[#168bc0]">
            {responsibility}
          </Text>
        </View>
      ))}
      {[...contributorByName.values()].map((contributor) => (
        <View
          className="rounded-full border border-[#d8e6f1] bg-[#f5faff] px-2 py-1"
          key={contributor.displayName}
        >
          <Text className="text-[11px] font-extrabold text-text-muted">
            {t('study.credits.contributor', {
              name: contributor.displayName,
              roles: contributor.roles
                .map((role) => t(roleLabels[role]))
                .join(t('study.credits.roleSeparator')),
            })}
          </Text>
        </View>
      ))}
    </View>
  )
}
