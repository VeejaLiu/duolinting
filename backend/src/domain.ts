export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type LessonMediaType = 'audio' | 'video';
export type ExerciseStatus = 'draft' | 'proofread' | 'published' | 'archived';
export type AdminRole = 'super_admin' | 'subtitle_contributor';
export type CourseContributionRole = 'proofreader' | 'second_reviewer';
/** 字幕贡献者个人工作稿的流转状态；它独立于课程面向学习端的发布状态。 */
export type SubtitleDraftStatus = 'editing' | 'submitted' | 'returned' | 'approved';
/** Admin 课程列表使用的协作工作流节点，不改变课程的对外发布状态。 */
export type CourseWorkflowStage = 'draft' | 'proofreading' | 'awaiting_review' | 'returned' | 'published' | 'archived';

export type UiLocale = 'zh-CN' | 'en-US' | 'th-TH' | 'ja-JP';
export type ContentLocale = 'zh-CN' | 'en-US' | 'th-TH' | 'ja-JP';

export type LocalizedDirectoryContent = {
    name?: string;
    description?: string;
};

export type LocalizedExerciseContent = {
    title?: string;
    summary?: string;
};

export type UserPreferences = {
    uiLocale: UiLocale;
    contentLocale: ContentLocale;
    /** 每日掌握句数目标；服务端默认 10。 */
    dailyGoal: number;
    updatedAt?: string;
};

/** 按客户端本地日期（yyyy-MM-dd）聚合的每日掌握句数，用于 streak 与今日进度。 */
export type DailyActivitySummary = {
    days: Record<string, number>;
};

export type MaterialCategory = {
    id: number;
    name: string;
    description: string;
    accent: string;
    coverImageUrl?: string;
    sortOrder: number;
    localizations?: Partial<Record<ContentLocale, LocalizedDirectoryContent>>;
};

export type ExerciseCategory = {
    id: number;
    groupId: number;
    name: string;
    description: string;
    accent: string;
    coverImageUrl?: string;
    /** 系列素材的公开出处链接，仅接受 http(s) URL。 */
    sourceUrl?: string;
    sortOrder: number;
    localizations?: Partial<Record<ContentLocale, LocalizedDirectoryContent>>;
};

export type TranscriptLine = {
    id: string;
    start: number;
    end: number;
    text: string;
    translation: string;
    translations?: Partial<Record<ContentLocale, string>>;
    answers: string[];
    keywords: string[];
};

export type ListeningExercise = {
    id: number;
    categoryId: number;
    title: string;
    /** 运营备注形式的来源名称，如节目、作者或导入渠道。 */
    source: string;
    /** 原始素材的公开出处链接；与用于运营备注的 source 字段分开保存。 */
    sourceUrl?: string;
    difficulty: Difficulty;
    durationLabel: string;
    mediaType: LessonMediaType;
    audioUrl: string;
    mediaSize?: number;
    coverImageUrl?: string;
    summary: string;
    status: ExerciseStatus;
    sortOrder: number;
    lines: TranscriptLine[];
    localizations?: Partial<Record<ContentLocale, LocalizedExerciseContent>>;
    contributors?: CourseContributor[];
    /** 课程页公开的协作负责人，只含展示名称，不含任何后台账号资料。 */
    workflowCredits?: CourseWorkflowCredits;
    /** 仅管理后台课程详情返回：当前成员的草稿，或超级管理员待二次审核的投稿。 */
    subtitleDrafts?: SubtitleDraft[];
};

export type CatalogExerciseSummary = Omit<ListeningExercise, 'lines'> & {
    lineCount: number;
    /** 仅管理后台列表使用，用来提示已发布课程仍有新的字幕稿等待审核。 */
    pendingSubtitleDraftCount?: number;
    /** 仅管理后台返回：课程当前处于协作管线的哪一步以及相关负责人。 */
    workflow?: CourseWorkflowSummary;
};

export type CourseWorkflowSummary = {
    stage: CourseWorkflowStage;
    contributorDisplayName?: string;
    submittedAt?: string;
    reviewNote?: string;
    /** 当前被指派负责校对的人；这是职责，不等同于已公开的实际贡献署名。 */
    proofreaderAssignee?: CourseWorkflowAssignee;
    /** 当前被指派负责二次审核的人；同样必须是字幕贡献者。 */
    secondReviewerAssignee?: CourseWorkflowAssignee;
    /** 已通过流程后记录的实际校对署名。 */
    proofreaderDisplayName?: string;
    /** 已通过流程后记录的实际二审署名。 */
    secondReviewerDisplayName?: string;
    /** 校对负责人是管理员指派还是自助领取；两种来源都遵循超时释放规则。 */
    proofreaderAssignmentSource?: CourseWorkflowAssignmentSource;
    /** 校对任务的滑动期限；未设置表示任务已停止计时（如已提交二审）。 */
    proofreaderClaimExpiresAt?: string;
    /** 该课程是否被超级管理员禁止自助领取。 */
    claimBlocked?: boolean;
    drafts?: CourseSubtitleDraftSummary[];
};

/** 管理员列表可见的课程工作流负责人；不含登录邮箱等身份资料。 */
export type CourseWorkflowAssignee = {
    adminUserId: number;
    displayName: string;
};

/** 课程列表的完整投稿历史摘要，供工作流轨道直接解释每个环节。 */
export type CourseSubtitleDraftSummary = {
    adminUserId: number;
    contributorDisplayName: string;
    status: SubtitleDraftStatus;
    submittedAt?: string;
    updatedAt?: string;
    reviewNote?: string;
};

export type SubtitleDraft = {
    id: number;
    exerciseId: number;
    contributorDisplayName: string;
    status: SubtitleDraftStatus;
    lines: TranscriptLine[];
    reviewNote?: string;
    submittedAt?: string;
    updatedAt?: string;
};

/** 字幕版本历史的一个快照：提交、审核通过或回退时的字幕内容与理由。 */
export type SubtitleVersionSource = 'submitted' | 'approved' | 'reverted';

export type ExerciseSubtitleVersion = {
    id: number;
    exerciseId: number;
    subtitleDraftId?: number;
    versionNo: number;
    lines: TranscriptLine[];
    source: SubtitleVersionSource;
    adminUserId: number;
    adminDisplayName: string;
    note?: string;
    createdAt: string;
};

export type AdminExercisePage = {
    items: CatalogExerciseSummary[];
    page: number;
    pageSize: number;
    total: number;
};

/** 当前登录审核人专属的待处理字幕稿；只返回完成审核所需的最小课程信息。 */
export type AdminReviewTask = {
    draftId: number;
    exerciseId: number;
    exerciseTitle: string;
    contributorDisplayName: string;
    submittedAt: string;
};

/** 当前成员的字幕协作任务与最近处理记录；课程发布状态与这里的协作阶段分开。 */
export type AdminSubtitleWorkflowTaskStage = 'proofreading' | 'awaiting_review' | 'returned' | 'completed';
export type AdminSubtitleWorkflowTaskRole = 'proofreader' | 'second_reviewer';
export type AdminSubtitleWorkflowTask = {
    draftId: number;
    exerciseId: number;
    exerciseTitle: string;
    contributorDisplayName: string;
    role: AdminSubtitleWorkflowTaskRole;
    stage: AdminSubtitleWorkflowTaskStage;
    draftStatus: SubtitleDraftStatus;
    submittedAt?: string;
    updatedAt?: string;
    reviewNote?: string;
    /** 任务来源与滑动期限，供任务中心展示倒计时。 */
    assignmentSource?: CourseWorkflowAssignmentSource;
    claimExpiresAt?: string;
};
export type AdminSubtitleWorkflowTaskInbox = {
    items: AdminSubtitleWorkflowTask[];
    counts: { proofreading: number; awaitingReview: number; returned: number; completedProofreading: number; completedSecondReview: number };
};

/** 后台工作流通知由服务端保存，重新登录后仍可查阅。 */
export type AdminWorkflowNotificationType = 'subtitle_submitted' | 'subtitle_returned' | 'subtitle_approved' | 'task_claim_expiring' | 'task_claim_expired';

/** 任务来源：两种来源都遵循同一套超时释放规则；该字段用于展示任务来源。 */
export type CourseWorkflowAssignmentSource = 'admin_assigned' | 'self_claimed';

/** 任务广场的可领取课程，只包含领取所需的最小信息。 */
export type ClaimableWorkflowTask = {
    exerciseId: number;
    exerciseTitle: string;
    categoryId: number;
    categoryName: string;
    difficulty: Difficulty;
    mediaType: LessonMediaType;
    lineCount: number;
    /** 之前被领取后又超时释放的次数，用于提示课程可能已有他人做过部分工作。 */
    claimReleaseCount: number;
};

export type ClaimableWorkflowTaskPage = {
    items: ClaimableWorkflowTask[];
    page: number;
    pageSize: number;
    total: number;
    policy: AdminTaskClaimPolicy;
};

export type AdminTaskClaimPolicy = {
    /** 领取后最多持有该课程的小时数；以最近一次保存草稿为起点滑动续期。 */
    claimWindowHours: number;
    /** 每位贡献者同时持有的课程上限。 */
    maxConcurrentClaims: number;
    /** 当前成员正在进行中的课程数，含管理员指派与自助领取。 */
    myActiveClaimCount: number;
};

/** 超级管理员的任务池概览，用于判断谁闲着、谁卡住、池子是否需要补课。 */
export type AdminWorkflowOverdueTask = {
    exerciseId: number;
    exerciseTitle: string;
    contributorDisplayName: string;
    source: CourseWorkflowAssignmentSource;
    stage: 'proofreading' | 'returned';
    claimExpiresAt: string;
    overdueHours: number;
};

export type AdminWorkflowContributorStat = {
    adminUserId: number;
    displayName: string;
    activeClaimCount: number;
    awaitingReviewCount: number;
    overdueCount: number;
    completedCount: number;
    isIdle: boolean;
};

export type AdminWorkflowOverview = {
    generatedAt: string;
    claimableCount: number;
    /** 课程草稿但媒体尚未就绪，无法进入任务池。 */
    unreadyDraftCount: number;
    /** 已被管理员标记为不开放领取的草稿课程数。 */
    claimBlockedCount: number;
    awaitingReviewCount: number;
    overdueTasks: AdminWorkflowOverdueTask[];
    contributors: AdminWorkflowContributorStat[];
    idleContributorCount: number;
    policy: AdminTaskClaimPolicy;
};

export type UpdateExerciseClaimAvailabilityRequest = {
    claimBlocked: boolean;
};

export type AdminWorkflowNotification = {
    id: number;
    type: AdminWorkflowNotificationType;
    exerciseId: number;
    exerciseTitle: string;
    actorDisplayName: string;
    reviewNote?: string;
    isRead: boolean;
    createdAt: string;
};

export type AdminWorkflowNotifications = {
    items: AdminWorkflowNotification[];
    unreadCount: number;
};

/** 面向全体后台成员的协作审计事件。事件只追加，避免改派或后续审核覆盖既有责任记录。 */
export type AdminWorkflowActivityType =
    | 'workflow_assigned'
    | 'workflow_unassigned'
    | 'workflow_claimed'
    | 'workflow_claim_released'
    | 'workflow_claim_expired'
    | 'subtitle_submitted'
    | 'subtitle_returned'
    | 'subtitle_approved'
    | 'subtitle_reverted';

export type AdminWorkflowActivity = {
    id: number;
    type: AdminWorkflowActivityType;
    exerciseId: number;
    exerciseTitle: string;
    /** 仅供已登录后台成员判断“是否与我相关”，页面不展示该内部 ID。 */
    actorAdminUserId?: number;
    targetAdminUserId?: number;
    actorDisplayName?: string;
    targetDisplayName?: string;
    workflowRole?: AdminSubtitleWorkflowTaskRole;
    subtitleDraftId?: number;
    reviewNote?: string;
    occurredAt: string;
};

export type AdminWorkflowActivityPage = {
    items: AdminWorkflowActivity[];
    page: number;
    pageSize: number;
    total: number;
};

export type LineProgress = {
    unclear: boolean;
    mastered: boolean;
    repeatCount: number;
    note: string;
    dictation: string;
};

export type ExerciseProgress = {
    exerciseId: number;
    lastLineId: string;
    showTranslation: boolean;
    hideTranscript: boolean;
    playbackRate: number;
    updatedAt: string;
    lines: Record<string, LineProgress>;
    vocabulary: Record<string, string>;
};

export type StudyStore = {
    activeExerciseId: number | '';
    progressByExercise: Record<string, ExerciseProgress>;
};

export type CatalogResponse = {
    categoryGroups: MaterialCategory[];
    categories: ExerciseCategory[];
    exercises: CatalogExerciseSummary[];
};

export type CreateCategoryRequest = {
    id?: number;
    groupId: number;
    name: string;
    description: string;
    accent: string;
    coverImageUrl?: string;
    sourceUrl?: string;
    sortOrder: number;
    localizations?: Partial<Record<ContentLocale, LocalizedDirectoryContent>>;
};

export type CreateCategoryGroupRequest = {
    id?: number;
    name: string;
    description: string;
    accent: string;
    coverImageUrl?: string;
    sortOrder: number;
    localizations?: Partial<Record<ContentLocale, LocalizedDirectoryContent>>;
};

export type CreateExerciseRequest = {
    id?: number;
    categoryId: number;
    title: string;
    source: string;
    sourceUrl?: string;
    difficulty: Difficulty;
    durationLabel: string;
    mediaType: LessonMediaType;
    audioUrl: string;
    coverImageUrl?: string;
    summary: string;
    sortOrder: number;
    status: ExerciseStatus;
    localizations?: Partial<Record<ContentLocale, LocalizedExerciseContent>>;
};

export type CreateTranscriptLineRequest = {
    id: string;
    start: number;
    end: number;
    text: string;
    translation: string;
    translations?: Partial<Record<ContentLocale, string>>;
    answers: string[];
    keywords: string[];
};

/** 后台开放内容 Key 的安全视图；不包含只在创建当次返回的明文 Key。 */
export type AdminOpenContentApiKey = {
    id: number;
    name: string;
    keyPrefix: string;
    createdAt: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
};

export type CreateOpenContentApiKeyRequest = {
    name: string;
    /** null 表示永不过期。 */
    expiresAt?: string | null;
};

export type UpdateOpenContentApiKeyRequest = {
    name?: string;
    /** null 表示取消已有的到期时间。 */
    expiresAt?: string | null;
};

/** 明文 secret 只允许在创建响应内出现一次，客户端不得持久化或再次请求。 */
export type CreateOpenContentApiKeyResponse = {
    apiKey: AdminOpenContentApiKey;
    secret: string;
};

/** dltjson 是课程字幕的可交换文件格式，时间单位为秒，course 为公开导出时附带的课程元数据。 */
export type DltjsonCourse = {
    id: number;
    categoryId: number;
    title: string;
    source: string;
    sourceUrl?: string;
    difficulty: Difficulty;
    durationLabel: string;
    summary: string;
    sortOrder: number;
    localizations?: Partial<Record<ContentLocale, LocalizedExerciseContent>>;
};

export type DltjsonFile = {
    version: '2.0';
    type: 'dltjson';
    course?: DltjsonCourse;
    lines: TranscriptLine[];
};

/** 开放内容目录：字幕与本地生成器所需的源媒体地址均可通过 API Key 读取。 */
export type OpenContentCatalogResponse = {
    version: '1.0';
    generatedAt: string;
    categoryGroups: Array<Omit<MaterialCategory, 'coverImageUrl'>>;
    categories: Array<Omit<ExerciseCategory, 'coverImageUrl'>>;
    courses: Array<DltjsonCourse & {
        /** 本地视频生成器读取源媒体的类型与地址；媒体仍由本地客户端下载和编码。 */
        mediaType: LessonMediaType;
        mediaUrl: string;
        lineCount: number;
        dltjsonUrl: string;
    }>;
};

export type AuthUser = {
    id: number;
    email: string;
    displayName: string;
};

export type CourseContributor = {
    displayName: string;
    roles: CourseContributionRole[];
};

/** 学习端公开的课程协作职责，不包含后台账号 ID、邮箱或审核意见。 */
export type CourseWorkflowCredits = {
    proofreaderDisplayName?: string;
    secondReviewerDisplayName?: string;
};

export type AuthClientType = 'web_app' | 'mobile_web' | 'mobile_app';

export type RegisterRequest = {
    email: string;
    displayName: string;
    password: string;
    clientType?: AuthClientType;
};

export type LoginRequest = {
    email: string;
    password: string;
    clientType?: AuthClientType;
};

/**
 * 排行榜公开条目：只包含昵称和当前掌握句数，不暴露邮箱等账号字段。
 * rank 从 1 开始；isCurrentUser 供客户端高亮当前登录用户。
 */
export type LeaderboardEntry = {
    rank: number;
    displayName: string;
    masteredLineCount: number;
    isCurrentUser: boolean;
};

/** currentUser 为 null 表示该用户尚无 mastered 记录，因此暂不参与排名。 */
export type LeaderboardResponse = {
    entries: LeaderboardEntry[];
    currentUser: { rank: number; masteredLineCount: number } | null;
};

export type FeedbackStatus = 'open' | 'reviewed' | 'dismissed';

export type AcceptedAnswerFeedback = {
    id: number;
    exerciseId: number;
    exerciseTitle: string;
    lineId: string;
    lineText: string;
    lineTranslation: string;
    acceptedAnswers: string[];
    submittedAnswer: string;
    status: FeedbackStatus;
    createdAt: string;
    updatedAt: string;
    user: {
        id: number;
        displayName: string;
        email: string;
    };
};

export type SubmitAcceptedAnswerFeedbackRequest = {
    exerciseId: number;
    lineId: string;
    submittedAnswer: string;
};
