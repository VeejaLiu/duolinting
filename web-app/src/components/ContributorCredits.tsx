import type { CourseContributor, CourseWorkflowCredits } from '@duolinting/shared'
import { useLanguage } from '../i18n/LanguageProvider'

const roleLabel: Record<string, string> = {
  proofreader: '校对',
  second_reviewer: '审核',
}

/** Public credits use the contributor's chosen display name only. */
export function ContributorCredits({
  contributors,
  workflowCredits,
}: {
  contributors?: CourseContributor[]
  workflowCredits?: CourseWorkflowCredits
}) {
  const { t } = useLanguage()
  const responsibilities = [
    workflowCredits?.proofreaderDisplayName && t('study.credits.proofreader', { name: workflowCredits.proofreaderDisplayName }),
    workflowCredits?.secondReviewerDisplayName && t('study.credits.secondReviewer', { name: workflowCredits.secondReviewerDisplayName }),
  ].filter(Boolean)

  if (!contributors?.length && responsibilities.length === 0) return null

  return (
    <div className="study-chapter-banner-credits" aria-label={t('study.credits.aria')}>
      {responsibilities.length > 0 && <>
        {responsibilities.map((responsibility) => (
          <span className="study-chapter-banner-credit" key={responsibility}>{responsibility}</span>
        ))}
      </>}
      {contributors?.length ? <>
        <span className="study-chapter-banner-credits-label">{t('study.credits.contributors')}</span>
        {contributors.map((contributor) => (
          <span className="study-chapter-banner-credit" key={contributor.displayName}>
            {contributor.displayName} · {contributor.roles.map((role) => roleLabel[role] ?? role).join('、')}
          </span>
        ))}
      </> : null}
    </div>
  )
}
