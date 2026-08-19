export type Difficulty = 'beginner' | 'intermediate' | 'advanced'
export type LessonMediaType = 'audio' | 'video'
export type ExerciseStatus = 'draft' | 'proofread' | 'published' | 'archived'
export type AdminRole = 'super_admin' | 'subtitle_contributor'
export type CourseContributionRole = 'proofreader' | 'second_reviewer'
/** 字幕贡献者个人工作稿的流转状态；它独立于课程面向学习端的发布状态。 */
export type SubtitleDraftStatus = 'editing' | 'submitted' | 'returned' | 'approved'
/** Admin 课程列表使用的协作工作流节点，不改变课程的对外发布状态。 */
export type CourseWorkflowStage = 'draft' | 'proofreading' | 'awaiting_review' | 'returned' | 'published' | 'archived'

/** 界面语言支持中、英、泰、日四种；内容语言可随课程翻译逐步扩展。 */
export type UiLocale = 'zh-CN' | 'en-US' | 'th-TH' | 'ja-JP'
export type ContentLocale = 'zh-CN' | 'en-US' | 'th-TH' | 'ja-JP'

export type LocalizedDirectoryContent = {
  name?: string
  description?: string
}

export type LocalizedExerciseContent = {
  title?: string
  summary?: string
}

export type UserPreferences = {
  uiLocale: UiLocale
  contentLocale: ContentLocale
  /** 每日掌握句数目标；服务端默认 10。 */
  dailyGoal: number
  updatedAt?: string
}

/** 按客户端本地日期（yyyy-MM-dd）聚合的每日掌握句数，用于 streak 与今日进度。 */
export type DailyActivitySummary = {
  days: Record<string, number>
}

export type MaterialCategory = {
  id: number
  name: string
  description: string
  accent: string
  coverImageUrl?: string
  sortOrder: number
  localizations?: Partial<Record<ContentLocale, LocalizedDirectoryContent>>
}

export type ExerciseCategory = {
  id: number
  groupId: number
  name: string
  description: string
  accent: string
  coverImageUrl?: string
  /** 系列素材的公开出处链接，仅接受 http(s) URL。 */
  sourceUrl?: string
  sortOrder: number
  localizations?: Partial<Record<ContentLocale, LocalizedDirectoryContent>>
}

export type TranscriptLine = {
  id: string
  start: number
  end: number
  text: string
  translation: string
  /**
   * 本地化字幕的权威数据。translation 保留给尚未升级的 Mobile 客户端，
   * 新版 Web 应按当前 contentLocale 从 translations 读取译文。
   */
  translations?: Partial<Record<ContentLocale, string>>
  answers: string[]
  keywords: string[]
}

export type ListeningExercise = {
  id: number
  categoryId: number
  title: string
  /** 运营备注形式的来源名称，如节目、作者或导入渠道。 */
  source: string
  /** 原始素材的公开出处链接；与用于运营备注的 source 字段分开保存。 */
  sourceUrl?: string
  difficulty: Difficulty
  durationLabel: string
  mediaType: LessonMediaType
  audioUrl: string
  mediaSize?: number
  coverImageUrl?: string
  summary: string
  status: ExerciseStatus
  lines: TranscriptLine[]
  sortOrder: number
  localizations?: Partial<Record<ContentLocale, LocalizedExerciseContent>>
  /** 课程页只公开贡献者的展示名称与已完成环节，绝不返回后台登录名或邮箱。 */
  contributors?: CourseContributor[]
  /**
   * 课程页可公开展示的当前协作负责人，只含展示名称。
   * 这与 contributors 的“已完成贡献署名”不同：前者是当前职责，后者是实际完成记录。
   */
  workflowCredits?: CourseWorkflowCredits
  /** 仅管理后台课程详情返回：当前成员的草稿，或超级管理员待二次审核的投稿。 */
  subtitleDrafts?: SubtitleDraft[]
}

export type CatalogExerciseSummary = Omit<ListeningExercise, 'lines'> & {
  lineCount: number
  /** 仅管理后台列表使用，用来提示已发布课程仍有新的字幕稿等待审核。 */
  pendingSubtitleDraftCount?: number
  /** 仅管理后台返回：课程当前处于协作管线的哪一步以及相关负责人。 */
  workflow?: CourseWorkflowSummary
}

export type CourseWorkflowSummary = {
  stage: CourseWorkflowStage
  contributorDisplayName?: string
  submittedAt?: string
  reviewNote?: string
  /** 当前被指派负责校对的人；这是职责，不等同于已公开的实际贡献署名。 */
  proofreaderAssignee?: CourseWorkflowAssignee
  /** 当前被指派负责二次审核的人；同样必须是字幕贡献者。 */
  secondReviewerAssignee?: CourseWorkflowAssignee
  /** 已通过流程后记录的实际校对署名。 */
  proofreaderDisplayName?: string
  /** 已通过流程后记录的实际二审署名。 */
  secondReviewerDisplayName?: string
  drafts?: CourseSubtitleDraftSummary[]
}

/** 管理员列表可见的课程工作流负责人；不含登录邮箱等身份资料。 */
export type CourseWorkflowAssignee = {
  adminUserId: number
  displayName: string
}

/** 课程列表的完整投稿历史摘要，供工作流轨道直接解释每个环节。 */
export type CourseSubtitleDraftSummary = {
  adminUserId: number
  contributorDisplayName: string
  status: SubtitleDraftStatus
  submittedAt?: string
  updatedAt?: string
  reviewNote?: string
}

export type SubtitleDraft = {
  id: number
  exerciseId: number
  contributorDisplayName: string
  status: SubtitleDraftStatus
  lines: TranscriptLine[]
  reviewNote?: string
  submittedAt?: string
  updatedAt?: string
}

export type AdminExercisePage = {
  items: CatalogExerciseSummary[]
  page: number
  pageSize: number
  total: number
}

/** 当前登录审核人专属的待处理字幕稿；只返回完成审核所需的最小课程信息。 */
export type AdminReviewTask = {
  draftId: number
  exerciseId: number
  exerciseTitle: string
  contributorDisplayName: string
  submittedAt: string
}

/** 当前成员的字幕协作任务与最近处理记录；课程发布状态与这里的协作阶段分开。 */
export type AdminSubtitleWorkflowTaskStage = 'proofreading' | 'awaiting_review' | 'returned' | 'completed'
export type AdminSubtitleWorkflowTaskRole = 'proofreader' | 'second_reviewer'
export type AdminSubtitleWorkflowTask = {
  draftId: number
  exerciseId: number
  exerciseTitle: string
  contributorDisplayName: string
  role: AdminSubtitleWorkflowTaskRole
  stage: AdminSubtitleWorkflowTaskStage
  draftStatus: SubtitleDraftStatus
  submittedAt?: string
  updatedAt?: string
  reviewNote?: string
}

export type AdminSubtitleWorkflowTaskInbox = {
  items: AdminSubtitleWorkflowTask[]
  counts: {
    proofreading: number
    awaitingReview: number
    returned: number
    completed: number
  }
}

/** 后台工作流通知由服务端保存，重新登录后仍可查阅。 */
export type AdminWorkflowNotificationType = 'subtitle_submitted' | 'subtitle_returned' | 'subtitle_approved'

export type AdminWorkflowNotification = {
  id: number
  type: AdminWorkflowNotificationType
  exerciseId: number
  exerciseTitle: string
  actorDisplayName: string
  reviewNote?: string
  isRead: boolean
  createdAt: string
}

export type AdminWorkflowNotifications = {
  items: AdminWorkflowNotification[]
  unreadCount: number
}

/** 面向全体后台成员的协作审计事件。事件只追加，避免改派或后续审核覆盖既有责任记录。 */
export type AdminWorkflowActivityType =
  | 'workflow_assigned'
  | 'workflow_unassigned'
  | 'subtitle_submitted'
  | 'subtitle_returned'
  | 'subtitle_approved'

export type AdminWorkflowActivity = {
  id: number
  type: AdminWorkflowActivityType
  exerciseId: number
  exerciseTitle: string
  actorDisplayName?: string
  targetDisplayName?: string
  workflowRole?: AdminSubtitleWorkflowTaskRole
  subtitleDraftId?: number
  reviewNote?: string
  occurredAt: string
}

/** 每位成员当前承担的工作量，供协作动态页展示彼此的进行中进度。 */
export type AdminWorkflowMemberProgress = {
  adminUserId: number
  displayName: string
  role: AdminRole
  isActive: boolean
  proofreaderAssignments: number
  reviewerAssignments: number
  awaitingReviewCount: number
  returnedCount: number
}

export type AdminWorkflowActivityPage = {
  items: AdminWorkflowActivity[]
  members: AdminWorkflowMemberProgress[]
  page: number
  pageSize: number
  total: number
}

/**
 * 单句学习状态：
 * - unclear: 用户显式标记“这句没听懂”，后续难点复习依赖它筛选句子。
 * - mastered: 用户显式标记“我已掌握”，章节和系列完成度都按这个字段累计。
 * - repeatCount: 记录用户重复播放该句的次数，移动端与 Web 共用同一统计口径。
 * - note: 用户围绕该句的补充笔记。
 * - dictation: 用户针对该句输入的听写答案原文。
 */
export type LineProgress = {
  unclear: boolean
  mastered: boolean
  repeatCount: number
  note: string
  dictation: string
}

/**
 * 单章节学习状态：
 * - lastLineId: 最近一次停留的字幕行 id，恢复学习时用它定位。
 * - showTranslation/hideTranscript: 学习偏好开关，保持多端行为一致。
 * - playbackRate: 当前章节播放速度。
 * - updatedAt: 最近一次修改章节进度的 ISO 时间字符串。
 * - lines: key 为字幕 line id，value 为该句的学习状态。
 * - vocabulary: key 为词汇文本，value 为用户收藏它时所在的原句。
 */
export type ExerciseProgress = {
  exerciseId: number
  lastLineId: string
  showTranslation: boolean
  hideTranscript: boolean
  playbackRate: number
  updatedAt: string
  lines: Record<string, LineProgress>
  vocabulary: Record<string, string>
}

/**
 * 整体学习存档：
 * - activeExerciseId: 最近活跃的章节 id；为空字符串表示用户还没有开始任何章节。
 * - progressByExercise: key 为 exercise id 的字符串形式，value 为章节学习状态。
 */
export type StudyStore = {
  activeExerciseId: number | ''
  progressByExercise: Record<string, ExerciseProgress>
}

export type CatalogResponse = {
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  exercises: CatalogExerciseSummary[]
}

export type UploadIntentRequest = {
  fileName: string
  contentType: string
}

export type UploadIntentResponse = {
  bucket: string
  objectName: string
  uploadUrl: string
  publicUrl: string
  acceptedContentType: string
  expiresInSeconds: number
}

export type MediaUploadResponse = {
  bucket: string
  objectName: string
  publicUrl: string
  contentType: string
  mediaType: LessonMediaType
  size: number
}

export type AudioUploadResponse = MediaUploadResponse

export type ImageUploadResponse = {
  bucket: string
  objectName: string
  publicUrl: string
  contentType: string
  size: number
}

export type CreateCategoryRequest = {
  id?: number
  groupId: number
  name: string
  description: string
  accent: string
  coverImageUrl?: string
  sourceUrl?: string
  sortOrder: number
  localizations?: Partial<Record<ContentLocale, LocalizedDirectoryContent>>
}

export type CreateCategoryGroupRequest = {
  id?: number
  name: string
  description: string
  accent: string
  coverImageUrl?: string
  sortOrder: number
  localizations?: Partial<Record<ContentLocale, LocalizedDirectoryContent>>
}

export type CreateExerciseRequest = {
  id?: number
  categoryId: number
  title: string
  source: string
  sourceUrl?: string
  difficulty: Difficulty
  durationLabel: string
  mediaType: LessonMediaType
  audioUrl: string
  coverImageUrl?: string
  summary: string
  sortOrder: number
  // 更新时需透传 archived，避免对已归档课程的改名/排序把状态改回 published
  status: ExerciseStatus
  localizations?: Partial<Record<ContentLocale, LocalizedExerciseContent>>
}

export type CreateTranscriptLineRequest = {
  id: string
  start: number
  end: number
  text: string
  translation: string
  translations?: Partial<Record<ContentLocale, string>>
  answers: string[]
  keywords: string[]
}

export type AdminContentResponse = {
  ok: true
  id?: number
}

export type AuthUser = {
  id: number
  email: string
  displayName: string
}

export type AuthClientType = 'web_app' | 'mobile_web' | 'mobile_app'

export type RegisterRequest = {
  email: string
  displayName: string
  password: string
  clientType?: AuthClientType
}

export type LoginRequest = {
  email: string
  password: string
  clientType?: AuthClientType
}

/** 已登录用户修改密码时提交的凭据；当前密码用于阻止拿到 token 后直接接管账号。 */
export type ChangePasswordRequest = {
  currentPassword: string
  newPassword: string
}

export type AuthResponse = {
  user: AuthUser
  token: string
}

export type AdminUser = {
  id: number
  email: string
  displayName: string
  role: AdminRole
  isActive: boolean
  /** 新建或被重设密码的后台账号必须先完成改密，才能进入管理功能。 */
  mustChangePassword: boolean
  createdAt?: string
  lastLoginAt?: string
  /** 仅字幕贡献者使用；有值时代表显示名称仍在 90 天自助修改冷却期内。 */
  nextDisplayNameChangeAt?: string
}

export type CourseContributor = {
  displayName: string
  roles: CourseContributionRole[]
}

/** 学习端公开的课程协作职责，不包含后台账号 ID、邮箱或审核意见。 */
export type CourseWorkflowCredits = {
  proofreaderDisplayName?: string
  secondReviewerDisplayName?: string
}

/** 人员管理页使用的后台账号资料；课程范围只适用于字幕贡献者。 */
export type AdminMember = AdminUser & {
  assignedExerciseIds: number[]
}

export type CreateAdminMemberRequest = {
  email: string
  displayName: string
  role: AdminRole
}

/** 仅在创建或重设临时密码的当次响应中返回，客户端不得持久化。 */
export type AdminMemberProvisioning = {
  id: number
  email: string
  displayName: string
  role: AdminRole
  temporaryPassword: string
}

export type ChangeAdminPasswordRequest = {
  currentPassword: string
  newPassword: string
}

export type UpdateContributorAssignmentsRequest = {
  exerciseIds: number[]
}

export type PreviewVolunteer = {
  id: number
  email: string
  displayName: string
  isPreviewVolunteer: boolean
}

export type UpdatePreviewVolunteerRequest = {
  isPreviewVolunteer: boolean
}

export type AdminLoginRequest = {
  email: string
  password: string
}

export type AdminAuthResponse = {
  user: AdminUser
  token: string
}

export type ProgressSyncResponse = {
  store: StudyStore | null
}

/**
 * 排行榜单条记录：
 * - rank: 名次，从 1 开始，按掌握句数降序排列的行号（并列不跳名次，行号即名次）；
 * - displayName: 用户昵称；只暴露昵称，绝不带 email（排行榜是公开数据）；
 * - masteredLineCount: 该用户当前处于 mastered 状态的句子总数；
 * - isCurrentUser: 是否为当前请求用户，客户端据此高亮自己的行。
 */
export type LeaderboardEntry = {
  rank: number
  displayName: string
  masteredLineCount: number
  isCurrentUser: boolean
}

/**
 * 排行榜响应：
 * - entries: top 50 榜单；
 * - currentUser: 当前用户的 { rank, masteredLineCount }。
 *   若当前用户已进入 top 50，此项与 entries 中 isCurrentUser 行为同一数据；
 *   为 null 表示当前用户还没有任何掌握记录，不参与排名。
 */
export type LeaderboardResponse = {
  entries: LeaderboardEntry[]
  currentUser: { rank: number; masteredLineCount: number } | null
}

export type FeedbackStatus = 'open' | 'reviewed' | 'dismissed'

export type AcceptedAnswerFeedback = {
  id: number
  exerciseId: number
  exerciseTitle: string
  lineId: string
  lineText: string
  lineTranslation: string
  acceptedAnswers: string[]
  submittedAnswer: string
  status: FeedbackStatus
  createdAt: string
  updatedAt: string
  user: {
    id: number
    displayName: string
    email: string
  }
}

export type SubmitAcceptedAnswerFeedbackRequest = {
  exerciseId: number
  lineId: string
  submittedAnswer: string
}

export type AcceptedAnswerFeedbackListResponse = {
  items: AcceptedAnswerFeedback[]
}

export type UpdateAcceptedAnswerFeedbackStatusRequest = {
  status: FeedbackStatus
}

export type AdminGrowthClientType = AuthClientType

/** 单端的去重活跃人数；跨端用户可同时出现在多个端，不能将三端相加当作总 DAU。 */
export type AdminGrowthClientDistribution = {
  clientType: AdminGrowthClientType
  activeTodayCount: number
  active7dCount: number
  active30dCount: number
}

/** 按服务器自然日聚合的增长趋势点，最近 30 天每天均返回，零值日期不会缺失。 */
export type AdminGrowthTrendPoint = {
  date: string
  registeredUserCount: number
  totalRegisteredUserCount: number
  activeUserCount: number
  weeklyActiveUserCount: number
  monthlyActiveUserCount: number
  webAppActiveUserCount: number
  mobileWebActiveUserCount: number
  mobileAppActiveUserCount: number
}

export type AdminGrowthReport = {
  // 报表生成时间（ISO 字符串），供 Admin 标示数据刷新时间。
  generatedAt: string
  // 每日访问事实的首日；null 表示尚未产生已登录访问。
  trackingStartedAt: string | null
  summary: {
    totalUsers: number
    registeredTodayCount: number
    registered7dCount: number
    registered30dCount: number
    dau: number
    wau: number
    mau: number
    dauMauPercent: number
  }
  trend: AdminGrowthTrendPoint[]
  clientDistribution: AdminGrowthClientDistribution[]
}
