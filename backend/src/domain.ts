export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type LessonMediaType = 'audio' | 'video';

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
    status: 'draft' | 'published' | 'archived';
    sortOrder: number;
    lines: TranscriptLine[];
    localizations?: Partial<Record<ContentLocale, LocalizedExerciseContent>>;
};

export type CatalogExerciseSummary = Omit<ListeningExercise, 'lines'> & {
    lineCount: number;
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
    status: 'draft' | 'published' | 'archived';
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
