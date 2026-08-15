import type { UiLocale } from '@duolinting/domain'
import { appMessages } from './messages/app'
import { authDialogMessages } from './messages/authDialog'
import { coreMessages } from './messages/core'
import { contributeMessages } from './messages/contribute'
import { courseMapMessages } from './messages/courseMap'
import { difficultReviewMessages } from './messages/difficultReview'
import { extensiveStageMessages } from './messages/extensiveStage'
import { intensiveStageMessages } from './messages/intensiveStage'
import { learnerAccountMessages } from './messages/learnerAccount'
import { mobileExperiencePromptMessages } from './messages/mobileExperiencePrompt'
import { settingsMessages } from './messages/settings'
import { studyStatesMessages } from './messages/studyStates'

// 各模块维护自己的消息表（web-app/src/i18n/messages/*.ts），这里按语言合并成
// 一张扁平表供 useLanguage().t(key) 查询。key 以模块名做前缀避免冲突。
const modules: Record<UiLocale, Record<string, string>>[] = [
  appMessages,
  authDialogMessages,
  coreMessages,
  contributeMessages,
  courseMapMessages,
  difficultReviewMessages,
  extensiveStageMessages,
  intensiveStageMessages,
  learnerAccountMessages,
  mobileExperiencePromptMessages,
  settingsMessages,
  studyStatesMessages,
]

const mergeLocale = (locale: UiLocale): Record<string, string> =>
  Object.assign({}, ...modules.map((table) => table[locale]))

export const messages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': mergeLocale('zh-CN'),
  'en-US': mergeLocale('en-US'),
  'th-TH': mergeLocale('th-TH'),
  'ja-JP': mergeLocale('ja-JP'),
}

export type MessageKey = string
