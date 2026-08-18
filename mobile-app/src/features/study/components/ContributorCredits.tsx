import { Text, View } from 'react-native'
import type { CourseContributor } from '@duolinting/domain'

const roleLabels: Record<string, string> = {
  proofreader: '校对',
  second_reviewer: '二次审核',
}

export function ContributorCredits({ contributors }: { contributors?: CourseContributor[] }) {
  if (!contributors?.length) return null
  return (
    <View className="border-b-2 border-[#d7e4ef] bg-white px-5 py-2">
      <Text className="text-xs font-bold text-text-muted">
        贡献者 · {contributors.map((contributor) => `${contributor.displayName}（${contributor.roles.map((role) => roleLabels[role] ?? role).join('、')}）`).join(' · ')}
      </Text>
    </View>
  )
}
