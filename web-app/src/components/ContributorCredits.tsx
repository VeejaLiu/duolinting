import type { CourseContributionRole, CourseContributor, CourseWorkflowCredits } from '@duolinting/shared'
import { useLanguage } from '../i18n/LanguageProvider'

const roleLabel: Record<string, string> = {
  proofreader: '校对',
  second_reviewer: '审核',
}

/**
 * Public credits use each person's chosen display name only.
 *
 * The API intentionally returns current workflow assignments separately from
 * completed contributions. A person can appear in both collections, so merge
 * matching names before rendering to avoid showing the same person twice.
 */
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
    contributorByName.set(contributor.displayName, {
      ...contributor,
      roles: [...new Set(contributor.roles)],
    })
  }

  const responsibilities: string[] = []
  const workflowAssignments: Array<{ displayName?: string; role: CourseContributionRole; label: string }> = [
    {
      displayName: workflowCredits?.proofreaderDisplayName,
      role: 'proofreader',
      label: 'study.credits.proofreader',
    },
    {
      displayName: workflowCredits?.secondReviewerDisplayName,
      role: 'second_reviewer',
      label: 'study.credits.secondReviewer',
    },
  ]

  for (const assignment of workflowAssignments) {
    if (!assignment.displayName) continue
    const existingContributor = contributorByName.get(assignment.displayName)
    if (existingContributor) {
      // Keep one public badge per person while retaining every known role.
      existingContributor.roles = [...new Set([...existingContributor.roles, assignment.role])]
      continue
    }
    responsibilities.push(t(assignment.label, { name: assignment.displayName }))
  }

  if (contributorByName.size === 0 && responsibilities.length === 0) return null

  return (
    <div className="study-chapter-banner-credits" aria-label={t('study.credits.aria')}>
      {responsibilities.length > 0 && <>
        {responsibilities.map((responsibility) => (
          <span className="study-chapter-banner-credit" key={responsibility}>{responsibility}</span>
        ))}
      </>}
      {contributorByName.size > 0 ? <>
        <span className="study-chapter-banner-credits-label">{t('study.credits.contributors')}</span>
        {[...contributorByName.values()].map((contributor) => (
          <span className="study-chapter-banner-credit" key={contributor.displayName}>
            {contributor.displayName} · {contributor.roles.map((role) => roleLabel[role] ?? role).join('、')}
          </span>
        ))}
      </> : null}
    </div>
  )
}
