import type { LeaderboardEntry } from '@duolinting/domain'
import { FontAwesome6 } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 前三名奖牌配色：金 / 银 / 铜（奖杯图标 + 圆底色）。
 * 第 4 名起用灰底黑字的名次数字。
 */
const MEDAL_COLORS = ['#ffc800', '#9aa5b1', '#cd7f32'] as const

/** 单个榜单行；当前用户行用绿边高亮并在昵称后标注"（我）" */
export function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const { t } = useLanguage()
  const medalColor =
    entry.rank <= 3 ? MEDAL_COLORS[entry.rank - 1] : undefined

  return (
    <View
      className={`flex-row items-center rounded-[16px] border-2 px-3 py-2.5 ${
        entry.isCurrentUser
          ? 'border-[#58cc02] bg-[#ecffe4]'
          : 'border-transparent bg-white'
      }`}
    >
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={
          medalColor
            ? { backgroundColor: medalColor }
            : { backgroundColor: '#eef5fb' }
        }
      >
        {medalColor ? (
          <FontAwesome6 color="#ffffff" name="trophy" size={12} />
        ) : (
          <Text className="text-sm font-black text-text-secondary">
            {entry.rank}
          </Text>
        )}
      </View>
      <Text
        className="ml-3 flex-1 text-base font-black text-text-primary"
        numberOfLines={1}
      >
        {entry.displayName}
        {entry.isCurrentUser ? t('leaderboard.me') : ''}
      </Text>
      <Text className="text-sm font-black text-text-secondary">
        {t('leaderboard.sentences', { count: entry.masteredLineCount })}
      </Text>
    </View>
  )
}
