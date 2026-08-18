import type { CourseContributor } from '@duolinting/shared'

const roleLabel: Record<string, string> = {
  proofreader: '校对',
  second_reviewer: '二次审核',
}

/** Public credits use the contributor's chosen display name only. */
export function ContributorCredits({ contributors }: { contributors?: CourseContributor[] }) {
  if (!contributors?.length) return null

  return (
    <div className="contributor-credits" aria-label="课程贡献者">
      <span>贡献者</span>
      {contributors.map((contributor) => (
        <span key={contributor.displayName}>
          {contributor.displayName} · {contributor.roles.map((role) => roleLabel[role] ?? role).join('、')}
        </span>
      ))}
    </div>
  )
}
