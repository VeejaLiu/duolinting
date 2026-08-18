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
    source: string;
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

export type AdminExercisePage = {
    items: CatalogExerciseSummary[];
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
