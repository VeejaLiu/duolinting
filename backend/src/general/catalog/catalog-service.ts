import type {
    CatalogExerciseSummary,
    CatalogResponse,
    ContentLocale,
    CourseWorkflowSummary,
    CourseWorkflowAssignee,
    CourseSubtitleDraftSummary,
    CourseContributor,
    CourseWorkflowCredits,
    CreateCategoryGroupRequest,
    CreateCategoryRequest,
    CreateExerciseRequest,
    CreateTranscriptLineRequest,
    ExerciseCategory,
    ListeningExercise,
    MaterialCategory,
    LocalizedDirectoryContent,
    LocalizedExerciseContent,
    TranscriptLine,
    SubtitleDraft,
} from '../../domain';
import {
    listExerciseContributors,
    getExerciseWorkflowCredits,
    listExerciseSubtitleDrafts,
    getPreviewSubtitleDraftForLearner,
} from '../admin/collaboration-service';
import type { AdminActor } from '../admin/collaboration-service';
import {
    buildPublicMediaUrl,
    buildStoredMediaUrl,
    deleteMediaObject,
    getManagedMediaObjectName,
    statMediaObject,
} from '../media/media-service';
import { Logger } from '../../lib/logger';
import { doRawQuery } from '../../models';
import { sequelize } from '../../models/db-config-mysql';
import { CategoryGroupModel } from '../../models/schema/CategoryGroupDB';
import { CategoryModel } from '../../models/schema/CategoryDB';
import { ExerciseModel } from '../../models/schema/ExerciseDB';

const logger = new Logger(__filename);

const emptyCatalog = (): CatalogResponse => ({
    categoryGroups: [],
    categories: [],
    exercises: [],
});

type ExerciseRow = {
    id: number;
    category_id: number;
    title: string;
    source: string;
    source_url?: string | null;
    difficulty: ListeningExercise['difficulty'];
    duration_label: string;
    media_type?: ListeningExercise['mediaType'];
    audio_url: string;
    audio_object_name?: string | null;
    cover_image_url?: string | null;
    summary: string;
    localizations_json?: unknown;
    transcript_json?: unknown;
    status: ListeningExercise['status'];
    sort_order?: number | string | null;
    created_at?: Date | string;
    pending_subtitle_draft_count?: number | string;
    workflow_stage?: CourseWorkflowSummary['stage'] | null;
    workflow_contributor_display_name?: string | null;
    workflow_submitted_at?: Date | string | null;
    workflow_review_note?: string | null;
    proofreader_display_name?: string | null;
    second_reviewer_display_name?: string | null;
    proofreader_assignee_json?: unknown;
    second_reviewer_assignee_json?: unknown;
    subtitle_drafts_json?: unknown;
    proofreader_assignment_source?: string | null;
    proofreader_claim_expires_at?: Date | string | null;
    claim_blocked?: boolean | number | null;
};

const supportedContentLocales = new Set<ContentLocale>([
    'zh-CN',
    'en-US',
    'th-TH',
    'ja-JP',
]);

export const parseContentLocale = (
    value: unknown,
): ContentLocale | undefined => {
    const locale = typeof value === 'string' ? value.trim() : '';
    return supportedContentLocales.has(locale as ContentLocale)
        ? (locale as ContentLocale)
        : undefined;
};

const parseJsonObject = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
};

const normalizeTranslations = (value: unknown) =>
    Object.fromEntries(
        Object.entries(parseJsonObject(value))
            .filter(
                ([locale, translation]) =>
                    supportedContentLocales.has(locale as ContentLocale) &&
                    typeof translation === 'string',
            )
            .map(([locale, translation]) => [
                locale,
                cleanSubtitleSpacing(translation as string),
            ])
            .filter(([, translation]) => Boolean(translation)),
    ) as Partial<Record<ContentLocale, string>>;

const normalizeDirectoryLocalizations = (value: unknown) =>
    Object.fromEntries(
        Object.entries(parseJsonObject(value))
            .filter(
                ([locale, item]) =>
                    supportedContentLocales.has(locale as ContentLocale) &&
                    item &&
                    typeof item === 'object',
            )
            .map(([locale, item]) => {
                const source = item as Record<string, unknown>;
                const normalized: LocalizedDirectoryContent = {
                    ...(typeof source.name === 'string' && source.name.trim()
                        ? { name: source.name.trim() }
                        : {}),
                    ...(typeof source.description === 'string' &&
                    source.description.trim()
                        ? { description: source.description.trim() }
                        : {}),
                };
                return [locale, normalized];
            })
            .filter(([, item]) => Object.keys(item as object).length > 0),
    ) as Partial<Record<ContentLocale, LocalizedDirectoryContent>>;

const normalizeExerciseLocalizations = (value: unknown) =>
    Object.fromEntries(
        Object.entries(parseJsonObject(value))
            .filter(
                ([locale, item]) =>
                    supportedContentLocales.has(locale as ContentLocale) &&
                    item &&
                    typeof item === 'object',
            )
            .map(([locale, item]) => {
                const source = item as Record<string, unknown>;
                const normalized: LocalizedExerciseContent = {
                    ...(typeof source.title === 'string' && source.title.trim()
                        ? { title: source.title.trim() }
                        : {}),
                    ...(typeof source.summary === 'string' &&
                    source.summary.trim()
                        ? { summary: source.summary.trim() }
                        : {}),
                };
                return [locale, normalized];
            })
            .filter(([, item]) => Object.keys(item as object).length > 0),
    ) as Partial<Record<ContentLocale, LocalizedExerciseContent>>;

const loadMediaSize = async (row: ExerciseRow) => {
    const objectName =
        row.audio_object_name || getObjectNameFromUrl(row.audio_url ?? '');
    if (!objectName) {
        return undefined;
    }

    try {
        const media = await statMediaObject(objectName);
        return media.size;
    } catch {
        return undefined;
    }
};

const englishPunctuationMap: Record<string, string> = {
    '，': ',',
    '。': '.',
    '！': '!',
    '？': '?',
    '；': ';',
    '：': ':',
    '（': '(',
    '）': ')',
    '【': '[',
    '】': ']',
    '［': '[',
    '］': ']',
    '“': '"',
    '”': '"',
    '‘': "'",
    '’': "'",
    '、': ',',
    '《': '<',
    '》': '>',
    '…': '...',
    '—': '-',
    '～': '~',
    '　': ' ',
};

const cleanSubtitleSpacing = (value: string) =>
    value.replace(/[ \t\u00a0\u3000]+/g, ' ').trim();

const cleanEnglishAnswerText = (value: string) =>
    cleanSubtitleSpacing(
        Array.from(value)
            .map((char) => englishPunctuationMap[char] ?? char)
            .join(''),
    );

const parseStringList = (value: unknown, cleanItem = cleanSubtitleSpacing) => {
    if (Array.isArray(value)) {
        return value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => cleanItem(item))
            .filter(Boolean);
    }

    if (typeof value !== 'string') {
        return [];
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed)
            ? parsed
                  .filter((item): item is string => typeof item === 'string')
                  .map((item) => cleanItem(item))
                  .filter(Boolean)
            : [];
    } catch {
        return [];
    }
};

const normalizeTranscriptLine = (
    line: unknown,
    index: number,
    contentLocale?: ContentLocale,
): TranscriptLine | null => {
    if (!line || typeof line !== 'object') {
        return null;
    }

    const item = line as Record<string, unknown>;
    const start = Number(item.start);
    const end = Number(item.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return null;
    }

    const translations = normalizeTranslations(item.translations);
    const legacyTranslation = cleanSubtitleSpacing(
        String(item.translation ?? ''),
    );
    // During rollout legacy JSON only has translation. Once translations exists,
    // it is authoritative and the old API field is derived for Mobile clients.
    if (!translations['zh-CN'] && legacyTranslation) {
        translations['zh-CN'] = legacyTranslation;
    }
    const resolvedTranslation = contentLocale
        ? (translations[contentLocale] ?? translations['zh-CN'] ?? '')
        : (translations['zh-CN'] ?? legacyTranslation);

    return {
        id: String(item.id ?? `l${index + 1}`),
        start,
        end,
        text: cleanEnglishAnswerText(String(item.text ?? '')),
        translation: resolvedTranslation,
        translations,
        answers: parseStringList(item.answers, cleanEnglishAnswerText),
        keywords: parseStringList(item.keywords),
    };
};

const parseTranscriptJson = (
    value: unknown,
    contentLocale?: ContentLocale,
): TranscriptLine[] => {
    if (Array.isArray(value)) {
        return value
            .map((line, index) =>
                normalizeTranscriptLine(line, index, contentLocale),
            )
            .filter((line): line is TranscriptLine => Boolean(line));
    }

    if (typeof value !== 'string' || !value.trim()) {
        return [];
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed)
            ? parsed
                  .map((line, index) =>
                      normalizeTranscriptLine(line, index, contentLocale),
                  )
                  .filter((line): line is TranscriptLine => Boolean(line))
            : [];
    } catch {
        return [];
    }
};

const serializeTranscriptLines = (lines: CreateTranscriptLineRequest[]) =>
    lines.map((line, index) => ({
        id: line.id || `l${index + 1}`,
        start: Number(line.start),
        end: Number(line.end),
        text: cleanEnglishAnswerText(String(line.text ?? '')),
        // translations is the persisted source of truth. Keep the legacy value
        // while old rows are still in circulation; it is never used by new reads.
        translations: normalizeTranslations({
            ...(line.translations ?? {}),
            ...(!line.translations?.['zh-CN'] && line.translation
                ? { 'zh-CN': line.translation }
                : {}),
        }),
        ...(line.translation
            ? { translation: cleanSubtitleSpacing(String(line.translation)) }
            : {}),
        answers: parseStringList(line.answers, cleanEnglishAnswerText),
        keywords: parseStringList(line.keywords),
    }));

const toStoredMediaUrl = (value: string | null | undefined) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
        return '';
    }

    const objectName = getManagedMediaObjectName(rawValue);
    return objectName ? buildStoredMediaUrl(objectName) : rawValue;
};

const getObjectNameFromUrl = getManagedMediaObjectName;

// 外部来源链接不属于 MinIO 托管媒体。写入前统一去除两端空格，
// 空字符串转为 NULL，避免接口返回看似存在但无法打开的空链接。
const normalizeSourceUrl = (value: string | null | undefined) => {
    const sourceUrl = value?.trim();
    return sourceUrl || null;
};

// 所有数据库引用先还原为受控对象键，再在 API 响应阶段选择 CDN 或旧 API 地址。
// 这样启用 CDN 后，历史课程无需数据迁移；非本系统的外部媒体 URL 也保持原样。
const toDeliveryMediaUrl = (value: string | null | undefined) => {
    const rawValue = String(value ?? '').trim();
    const objectName = getManagedMediaObjectName(rawValue);
    return objectName ? buildPublicMediaUrl(objectName) : rawValue;
};

const buildExerciseSummary = (
    row: ExerciseRow,
    lineCount: number,
    contentLocale?: ContentLocale,
): CatalogExerciseSummary => {
    // 优先以个人字幕稿判断协作节点：已发布课程也可能有新的投稿待审，
    // 所以不能仅依赖 exercises.status 来判断它正卡在哪一步。
    const stage = row.workflow_stage
        ?? (row.status === 'archived'
            ? 'archived'
            : row.status === 'published'
                ? 'published'
                : row.status === 'proofread'
                    ? 'awaiting_review'
                : 'draft');
    const parseWorkflowList = <T>(value: unknown): T[] => {
        if (Array.isArray(value)) return value as T[];
        if (typeof value !== 'string' || !value.trim()) return [];
        try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed as T[] : [];
        } catch {
            return [];
        }
    };
    const parseWorkflowAssignee = (value: unknown): CourseWorkflowAssignee | undefined => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const candidate = value as Partial<CourseWorkflowAssignee>;
            return typeof candidate.adminUserId === 'number' && typeof candidate.displayName === 'string'
                ? { adminUserId: candidate.adminUserId, displayName: candidate.displayName }
                : undefined;
        }
        if (typeof value !== 'string' || !value.trim()) return undefined;
        try {
            return parseWorkflowAssignee(JSON.parse(value));
        } catch {
            return undefined;
        }
    };
    const workflow: CourseWorkflowSummary = {
        stage,
        contributorDisplayName: row.workflow_contributor_display_name || undefined,
        submittedAt: row.workflow_submitted_at
            ? new Date(row.workflow_submitted_at).toISOString()
            : undefined,
        reviewNote: row.workflow_review_note || undefined,
        proofreaderAssignee: parseWorkflowAssignee(row.proofreader_assignee_json),
        secondReviewerAssignee: parseWorkflowAssignee(row.second_reviewer_assignee_json),
        proofreaderDisplayName: row.proofreader_display_name || undefined,
        secondReviewerDisplayName: row.second_reviewer_display_name || undefined,
        proofreaderAssignmentSource: row.proofreader_assignment_source === 'self_claimed'
            ? 'self_claimed'
            : row.proofreader_assignment_source === 'admin_assigned'
                ? 'admin_assigned'
                : undefined,
        proofreaderClaimExpiresAt: row.proofreader_claim_expires_at
            ? new Date(row.proofreader_claim_expires_at).toISOString()
            : undefined,
        claimBlocked: Boolean(row.claim_blocked),
        drafts: parseWorkflowList<CourseSubtitleDraftSummary>(row.subtitle_drafts_json),
    };
    return {
    id: Number(row.id),
    categoryId: Number(row.category_id),
    title: contentLocale
        ? (normalizeExerciseLocalizations(row.localizations_json)[contentLocale]
              ?.title ?? row.title)
        : row.title,
    source: row.source,
    sourceUrl: normalizeSourceUrl(row.source_url) || undefined,
    difficulty: row.difficulty,
    durationLabel: row.duration_label,
    mediaType: row.media_type ?? 'audio',
    audioUrl: toDeliveryMediaUrl(row.audio_url),
    coverImageUrl: toDeliveryMediaUrl(row.cover_image_url) || undefined,
    summary: contentLocale
        ? (normalizeExerciseLocalizations(row.localizations_json)[contentLocale]
              ?.summary ?? row.summary)
        : row.summary,
    status: row.status,
    sortOrder: Number(row.sort_order ?? 0),
    lineCount,
    pendingSubtitleDraftCount: Number(row.pending_subtitle_draft_count ?? 0),
    workflow,
    localizations: normalizeExerciseLocalizations(row.localizations_json),
    };
};

// 该片段被 Admin 的所有课程列表复用，避免列表与详情因不同 SQL 规则而显示不同阶段。
const adminWorkflowSelect = (exerciseAlias: string) => `
    (
      select count(*) from exercise_subtitle_drafts subtitle_drafts
      where subtitle_drafts.exercise_id = ${exerciseAlias}.id and subtitle_drafts.status = 'submitted'
    ) as pending_subtitle_draft_count,
    coalesce(
      (
        select case subtitle_drafts.status
          when 'submitted' then 'awaiting_review'
          when 'returned' then 'returned'
          when 'editing' then 'proofreading'
          else null
        end
        from exercise_subtitle_drafts subtitle_drafts
        where subtitle_drafts.exercise_id = ${exerciseAlias}.id
          and subtitle_drafts.status in ('submitted', 'returned', 'editing')
        order by field(subtitle_drafts.status, 'submitted', 'returned', 'editing'),
                 subtitle_drafts.updated_at desc
        limit 1
      ),
      case ${exerciseAlias}.status
        when 'archived' then 'archived'
        when 'published' then 'published'
        when 'proofread' then 'awaiting_review'
        else 'draft'
      end
    ) as workflow_stage,
    (
      select admins.display_name
      from exercise_subtitle_drafts subtitle_drafts
      inner join admin_users admins on admins.id = subtitle_drafts.admin_user_id
      where subtitle_drafts.exercise_id = ${exerciseAlias}.id
        and subtitle_drafts.status in ('submitted', 'returned', 'editing')
      order by field(subtitle_drafts.status, 'submitted', 'returned', 'editing'),
               subtitle_drafts.updated_at desc
      limit 1
    ) as workflow_contributor_display_name,
    (
      select subtitle_drafts.submitted_at
      from exercise_subtitle_drafts subtitle_drafts
      where subtitle_drafts.exercise_id = ${exerciseAlias}.id
        and subtitle_drafts.status = 'submitted'
      order by subtitle_drafts.submitted_at desc
      limit 1
    ) as workflow_submitted_at,
    (
      select subtitle_drafts.review_note
      from exercise_subtitle_drafts subtitle_drafts
      where subtitle_drafts.exercise_id = ${exerciseAlias}.id
        and subtitle_drafts.status = 'returned'
      order by subtitle_drafts.updated_at desc
      limit 1
    ) as workflow_review_note,
    (
      select admins.display_name
      from exercise_contributions contributions
      inner join admin_users admins on admins.id = contributions.admin_user_id
      where contributions.exercise_id = ${exerciseAlias}.id
        and contributions.contribution_role = 'proofreader'
      limit 1
    ) as proofreader_display_name,
    (
      select admins.display_name
      from exercise_contributions contributions
      inner join admin_users admins on admins.id = contributions.admin_user_id
      where contributions.exercise_id = ${exerciseAlias}.id
        and contributions.contribution_role = 'second_reviewer'
      limit 1
    ) as second_reviewer_display_name
    ,(
      select json_object(
        'adminUserId', assignees.admin_user_id,
        'displayName', admins.display_name
      )
      from exercise_workflow_assignees assignees
      inner join admin_users admins on admins.id = assignees.admin_user_id
      where assignees.exercise_id = ${exerciseAlias}.id
        and assignees.workflow_role = 'proofreader'
      limit 1
    ) as proofreader_assignee_json
    ,(
      select json_object(
        'adminUserId', assignees.admin_user_id,
        'displayName', admins.display_name
      )
      from exercise_workflow_assignees assignees
      inner join admin_users admins on admins.id = assignees.admin_user_id
      where assignees.exercise_id = ${exerciseAlias}.id
        and assignees.workflow_role = 'second_reviewer'
      limit 1
    ) as second_reviewer_assignee_json
    ,(
      select coalesce(json_arrayagg(json_object(
        'adminUserId', subtitle_drafts.admin_user_id,
        'contributorDisplayName', admins.display_name,
        'status', subtitle_drafts.status,
        'submittedAt', subtitle_drafts.submitted_at,
        'updatedAt', subtitle_drafts.updated_at,
        'reviewNote', subtitle_drafts.review_note
      )), json_array())
      from exercise_subtitle_drafts subtitle_drafts
      inner join admin_users admins on admins.id = subtitle_drafts.admin_user_id
      where subtitle_drafts.exercise_id = ${exerciseAlias}.id
    ) as subtitle_drafts_json
    ,(
      select assignees.assignment_source
      from exercise_workflow_assignees assignees
      where assignees.exercise_id = ${exerciseAlias}.id
        and assignees.workflow_role = 'proofreader'
      limit 1
    ) as proofreader_assignment_source
    ,(
      select assignees.claim_expires_at
      from exercise_workflow_assignees assignees
      where assignees.exercise_id = ${exerciseAlias}.id
        and assignees.workflow_role = 'proofreader'
      limit 1
    ) as proofreader_claim_expires_at
    ,${exerciseAlias}.claim_blocked as claim_blocked
`;

const buildExerciseDetail = (
    row: ExerciseRow,
    lines: TranscriptLine[],
    mediaSize?: number,
    contentLocale?: ContentLocale,
    contributors?: CourseContributor[],
    workflowCredits?: CourseWorkflowCredits,
    subtitleDrafts?: SubtitleDraft[],
): ListeningExercise => ({
    id: Number(row.id),
    categoryId: Number(row.category_id),
    title: contentLocale
        ? (normalizeExerciseLocalizations(row.localizations_json)[contentLocale]
              ?.title ?? row.title)
        : row.title,
    source: row.source,
    sourceUrl: normalizeSourceUrl(row.source_url) || undefined,
    difficulty: row.difficulty,
    durationLabel: row.duration_label,
    mediaType: row.media_type ?? 'audio',
    audioUrl: toDeliveryMediaUrl(row.audio_url),
    mediaSize,
    coverImageUrl: toDeliveryMediaUrl(row.cover_image_url) || undefined,
    summary: contentLocale
        ? (normalizeExerciseLocalizations(row.localizations_json)[contentLocale]
              ?.summary ?? row.summary)
        : row.summary,
    status: row.status,
    sortOrder: Number(row.sort_order ?? 0),
    lines,
    localizations: normalizeExerciseLocalizations(row.localizations_json),
    contributors,
    workflowCredits,
    subtitleDrafts,
});

const loadCategoryRows = async () => {
    try {
        return await doRawQuery<any>({
            query: `
                select
                  id,
                  group_id,
                  name,
                  description,
                  localizations_json,
                  accent,
                  cover_image_url,
                  source_url,
                  sort_order
                from categories
                order by sort_order asc, name asc
            `,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('cover_image_url') && !message.includes('source_url')) {
            throw error;
        }

        return doRawQuery<any>({
            query: `
                select
                  id,
                  group_id,
                  name,
                  description,
                  localizations_json,
                  accent,
                  sort_order
                from categories
                order by sort_order asc, name asc
            `,
        });
    }
};

const loadCategoryGroupRows = async () => {
    try {
        return await doRawQuery<any>({
            query: `
                select
                  id,
                  name,
                  description,
                  localizations_json,
                  accent,
                  cover_image_url,
                  sort_order
                from category_groups
                order by sort_order asc, name asc
            `,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('cover_image_url')) {
            throw error;
        }

        return doRawQuery<any>({
            query: `
                select
                  id,
                  name,
                  description,
                  localizations_json,
                  accent,
                  sort_order
                from category_groups
                order by sort_order asc, name asc
            `,
        });
    }
};

const buildLearnerStatusFilter = (previewExerciseIds: number[] = []) => {
    const ids = previewExerciseIds.filter((id) => Number.isInteger(id) && id > 0);
    return ids.length > 0
        ? `(status = 'published' or (id in (${ids.join(',')}) and status in ('draft', 'proofread', 'published')))`
        : `status = 'published'`;
};

const loadCategoryIdsWithExercises = async (includeDrafts = false, previewExerciseIds: number[] = []) => {
    const statusFilter = includeDrafts ? '' : `where ${buildLearnerStatusFilter(previewExerciseIds)}`;
    const rows = await doRawQuery<any>({
        query: `
            select distinct category_id
            from exercises
            ${statusFilter}
        `,
    });

    return new Set(
        (rows as Array<{ category_id: number | string }>).map((row) =>
            Number(row.category_id),
        ),
    );
};

export async function listCatalog(
    includeDrafts = false,
    includeEmptyDirectories = false,
    contentLocale?: ContentLocale,
    previewExerciseIds: number[] = [],
): Promise<CatalogResponse> {
    try {
        const categoryGroupRows = await loadCategoryGroupRows();
        const categoryRows = await loadCategoryRows();
        const categoryIdsWithExercises =
            await loadCategoryIdsWithExercises(includeDrafts, previewExerciseIds);

        const mappedCategories: ExerciseCategory[] = categoryRows.map(
            (row: any) => ({
                id: Number(row.id),
                groupId: Number(row.group_id),
                name: contentLocale
                    ? (normalizeDirectoryLocalizations(row.localizations_json)[
                          contentLocale
                      ]?.name ?? row.name)
                    : row.name,
                description: contentLocale
                    ? (normalizeDirectoryLocalizations(row.localizations_json)[
                          contentLocale
                      ]?.description ?? row.description)
                    : row.description,
                accent: row.accent,
                coverImageUrl:
                    toDeliveryMediaUrl(row.cover_image_url) || undefined,
                sourceUrl: normalizeSourceUrl(row.source_url) || undefined,
                sortOrder: Number(row.sort_order ?? 0),
                localizations: normalizeDirectoryLocalizations(
                    row.localizations_json,
                ),
            }),
        );
        // Learners should only see series with content; administrators must also
        // manage newly created, currently empty categories and groups.
        const categories = includeEmptyDirectories
            ? mappedCategories
            : mappedCategories.filter((category) =>
                  categoryIdsWithExercises.has(category.id),
              );
        const visibleGroupIds = new Set(
            categories.map((category) => category.groupId),
        );

        const categoryGroups: MaterialCategory[] = categoryGroupRows
            .map((row: any) => ({
                id: Number(row.id),
                name: contentLocale
                    ? (normalizeDirectoryLocalizations(row.localizations_json)[
                          contentLocale
                      ]?.name ?? row.name)
                    : row.name,
                description: contentLocale
                    ? (normalizeDirectoryLocalizations(row.localizations_json)[
                          contentLocale
                      ]?.description ?? row.description)
                    : row.description,
                accent: row.accent,
                coverImageUrl:
                    toDeliveryMediaUrl(row.cover_image_url) || undefined,
                sortOrder: Number(row.sort_order ?? 0),
                localizations: normalizeDirectoryLocalizations(
                    row.localizations_json,
                ),
            }))
            .filter(
                (group) =>
                    includeEmptyDirectories || visibleGroupIds.has(group.id),
            );

        // exercises 不再随 catalog 返回，改为按系列懒加载
        return { categoryGroups, categories, exercises: [] };
    } catch {
        return emptyCatalog();
    }
}

export async function listCategoryExercises(
    categoryId: number,
    includeDrafts = false,
    contentLocale?: ContentLocale,
    previewExerciseIds: number[] = [],
): Promise<CatalogExerciseSummary[]> {
    const statusFilter = includeDrafts ? '' : `and ${buildLearnerStatusFilter(previewExerciseIds)}`;

    try {
        const exerciseRows = await doRawQuery<any>({
            query: `
                select
                  id,
                  category_id,
                  title,
                  source,
                  source_url,
                  difficulty,
                  duration_label,
                  media_type,
                  audio_url,
                  cover_image_url,
                  summary,
                  localizations_json,
                  transcript_json,
                  status,
                  sort_order,
                  created_at
                from exercises
                where category_id = ?
                  ${statusFilter}
                order by sort_order asc, created_at desc, title asc
            `,
            params: [categoryId],
        });

        return (exerciseRows as ExerciseRow[]).map((row) => {
            const lines = parseTranscriptJson(row.transcript_json);
            return buildExerciseSummary(row, lines.length, contentLocale);
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('transcript_json')) {
            throw error;
        }

        const exerciseRows = await doRawQuery<any>({
            query: `
                select
                  id,
                  category_id,
                  title,
                  source,
                  source_url,
                  difficulty,
                  duration_label,
                  media_type,
                  audio_url,
                  cover_image_url,
                  summary,
                  localizations_json,
                  status,
                  sort_order,
                  created_at
                from exercises
                where category_id = ?
                  ${statusFilter}
                order by sort_order asc, created_at desc, title asc
            `,
            params: [categoryId],
        });

        return (exerciseRows as ExerciseRow[]).map((row) => {
            // Without transcript_json, we don't know the line count
            return buildExerciseSummary(row, 0, contentLocale);
        });
    }
}

export async function listAllExercises(): Promise<CatalogExerciseSummary[]> {
    const exerciseRows = await doRawQuery<ExerciseRow>({
        query: `
            select
              id,
              category_id,
              title,
              source,
              source_url,
              difficulty,
              duration_label,
              media_type,
              audio_url,
              audio_object_name,
              cover_image_url,
              summary,
              localizations_json,
              transcript_json,
              status,
              sort_order,
              created_at,
              ${adminWorkflowSelect('exercises')}
            from exercises
            order by sort_order asc, created_at desc, title asc
        `,
    });

    return (exerciseRows as ExerciseRow[]).map((row) => {
        const lines = parseTranscriptJson(row.transcript_json);
        return buildExerciseSummary(row, lines.length);
    });
}

type AdminExercisePageOptions = {
    categoryId?: number;
    groupId?: number;
    status?: 'draft' | 'proofread' | 'published' | 'archived';
    search?: string;
    page: number;
    pageSize: number;
    assignedExerciseIds?: number[];
};

export async function listAdminExercisesPage(
    options: AdminExercisePageOptions,
) {
    const conditions: string[] = [];
    const replacements: Record<string, string | number | number[]> = {};
    if (options.categoryId) {
        conditions.push('e.category_id = :categoryId');
        replacements.categoryId = options.categoryId;
    }
    if (options.groupId) {
        conditions.push('c.group_id = :groupId');
        replacements.groupId = options.groupId;
    }
    if (options.status) {
        conditions.push('e.status = :status');
        replacements.status = options.status;
    }
    if (options.assignedExerciseIds) {
        if (options.assignedExerciseIds.length === 0) {
            return { items: [], page: options.page, pageSize: options.pageSize, total: 0 };
        }
        conditions.push('e.id in (:assignedExerciseIds)');
        replacements.assignedExerciseIds = options.assignedExerciseIds;
    }
    if (options.search) {
        // Search only operator-facing fields; the bound parameter prevents SQL injection.
        conditions.push(
            '(e.title like :search or e.source like :search or e.summary like :search)',
        );
        replacements.search = `%${options.search}%`;
    }

    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const countRows = await doRawQuery<{ total: number | string }>({
        query: `select count(*) as total from exercises e inner join categories c on c.id = e.category_id ${where}`,
        params: replacements,
    });
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (options.page - 1) * options.pageSize;
    const rows = await doRawQuery<ExerciseRow>({
        query: `
            select e.id, e.category_id, e.title, e.source, e.source_url, e.difficulty, e.duration_label,
                   e.media_type, e.audio_url, e.audio_object_name, e.cover_image_url, e.summary,
                   e.transcript_json, e.status, e.sort_order, e.created_at,
                   ${adminWorkflowSelect('e')}
            from exercises e inner join categories c on c.id = e.category_id
            ${where}
            order by e.sort_order asc, e.created_at desc, e.title asc
            limit :limit offset :offset
        `,
        params: { ...replacements, limit: options.pageSize, offset },
    });

    return {
        items: rows.map((row) =>
            buildExerciseSummary(
                row,
                parseTranscriptJson(row.transcript_json).length,
            ),
        ),
        page: options.page,
        pageSize: options.pageSize,
        total,
    };
}

export async function getExercise(
    exerciseId: number,
    includeDrafts = false,
    contentLocale?: ContentLocale,
    previewExerciseIds: number[] = [],
    adminActor?: AdminActor,
    previewLearnerUserId?: number,
) {
    const rows = await doRawQuery<ExerciseRow>({
        query: `
            select
              id,
              category_id,
              title,
              source,
              source_url,
              difficulty,
              duration_label,
              media_type,
              audio_url,
              audio_object_name,
              cover_image_url,
              summary,
              localizations_json,
              transcript_json,
              status,
              sort_order,
              created_at
            from exercises
            where id = ?
              ${includeDrafts ? '' : `and ${buildLearnerStatusFilter(previewExerciseIds)}`}
            limit 1
        `,
        params: [exerciseId],
    });

    const row = rows[0];
    if (!row) {
        return null;
    }

    const [mediaSize, contributors, workflowCredits, subtitleDrafts] = await Promise.all([
        loadMediaSize(row),
        listExerciseContributors(exerciseId),
        getExerciseWorkflowCredits(exerciseId),
        adminActor ? listExerciseSubtitleDrafts(exerciseId, adminActor) : Promise.resolve(undefined),
    ]);
    // A volunteer sees the latest submitted revision for review.  Personal
    // editing drafts never leave Admin; ordinary learners still receive the
    // last approved transcript stored on the course itself.
    const previewDraft = previewExerciseIds.includes(exerciseId) && !adminActor
        ? await getPreviewSubtitleDraftForLearner(exerciseId, previewLearnerUserId)
        : undefined;
    return buildExerciseDetail(
        row,
        previewDraft
            ? previewDraft.lines
            : parseTranscriptJson(row.transcript_json, contentLocale),
        mediaSize,
        contentLocale,
        contributors,
        workflowCredits,
        subtitleDrafts,
    );
}

/**
 * 开放内容导出只读取已发布课程的目录、字幕和媒体读取地址。它不复用 getExercise，
 * 原因是后者还会检查 MinIO 媒体大小并加载协作信息；这些数据不应成为字幕同步的依赖。
 */
export async function getPublishedExerciseForOpenContent(exerciseId: number) {
    const rows = await doRawQuery<ExerciseRow>({
        query: `
            select
              id,
              category_id,
              title,
              source,
              source_url,
              difficulty,
              duration_label,
              media_type,
              audio_url,
              summary,
              localizations_json,
              transcript_json,
              sort_order
            from exercises
            where id = ? and status = 'published'
            limit 1
        `,
        params: [exerciseId],
    });
    const row = rows[0];
    if (!row) {
        return null;
    }

    return {
        id: Number(row.id),
        categoryId: Number(row.category_id),
        title: row.title,
        source: row.source,
        sourceUrl: normalizeSourceUrl(row.source_url) || undefined,
        difficulty: row.difficulty,
        durationLabel: row.duration_label,
        mediaType: row.media_type ?? 'audio',
        mediaUrl: toDeliveryMediaUrl(row.audio_url),
        summary: row.summary,
        sortOrder: Number(row.sort_order ?? 0),
        localizations: normalizeExerciseLocalizations(row.localizations_json),
        lines: parseTranscriptJson(row.transcript_json),
    };
}

export async function upsertCategory(category: CreateCategoryRequest) {
    const payload = {
        ...(category.id ? { id: category.id } : {}),
        group_id: category.groupId,
        name: category.name,
        description: category.description,
        localizations_json: normalizeDirectoryLocalizations(
            category.localizations,
        ),
        accent: category.accent,
        cover_image_url: toStoredMediaUrl(category.coverImageUrl) || null,
        source_url: normalizeSourceUrl(category.sourceUrl),
        sort_order: category.sortOrder,
    } as any;

    await CategoryModel.upsert(payload);
}

export async function upsertCategoryGroup(group: CreateCategoryGroupRequest) {
    await CategoryGroupModel.upsert({
        ...(group.id ? { id: group.id } : {}),
        name: group.name,
        description: group.description,
        localizations_json: normalizeDirectoryLocalizations(
            group.localizations,
        ),
        accent: group.accent,
        cover_image_url: toStoredMediaUrl(group.coverImageUrl) || null,
        sort_order: group.sortOrder,
    } as any);
}

export async function deleteCategoryGroup(groupId: number) {
    const group = (await CategoryGroupModel.findOne({
        where: { id: groupId },
        attributes: ['cover_image_url'],
        raw: true,
    })) as { cover_image_url?: string | null } | null;
    const categoryCount = await CategoryModel.count({
        where: { group_id: groupId },
    });

    if (categoryCount > 0) {
        throw new Error('请先删除或移动这个内容分类下的学习系列');
    }

    await CategoryGroupModel.destroy({
        where: { id: groupId },
    });

    const coverObjectName = getObjectNameFromUrl(group?.cover_image_url ?? '');
    if (coverObjectName) {
        await deleteMediaObject(coverObjectName);
    }
}

export async function deleteCategory(categoryId: number) {
    const category = (await CategoryModel.findOne({
        where: { id: categoryId },
        attributes: ['cover_image_url'],
        raw: true,
    })) as { cover_image_url?: string | null } | null;
    const exerciseCount = await ExerciseModel.count({
        where: { category_id: categoryId },
    });

    if (exerciseCount > 0) {
        throw new Error('请先删除或移动这个学习系列下的课程');
    }

    await CategoryModel.destroy({
        where: { id: categoryId },
    });

    const coverObjectName = getObjectNameFromUrl(
        category?.cover_image_url ?? '',
    );
    if (coverObjectName) {
        await deleteMediaObject(coverObjectName);
    }
}

export async function deleteExercise(exerciseId: number) {
    const exercise = (await ExerciseModel.findOne({
        where: { id: exerciseId },
        attributes: ['audio_object_name', 'audio_url', 'cover_image_url'],
        raw: true,
    })) as {
        audio_object_name?: string | null;
        audio_url?: string | null;
        cover_image_url?: string | null;
    } | null;

    if (!exercise) {
        throw new Error('课程不存在');
    }

    const objectName =
        exercise.audio_object_name ||
        getObjectNameFromUrl(exercise.audio_url ?? '');
    if (objectName) {
        await deleteMediaObject(objectName);
    }
    const coverObjectName = getObjectNameFromUrl(
        exercise.cover_image_url ?? '',
    );
    if (coverObjectName) {
        await deleteMediaObject(coverObjectName);
    }

    await sequelize.transaction(async (transaction) => {
        await sequelize.query(
            'delete from line_progress where exercise_id = :exerciseId',
            {
                replacements: { exerciseId },
                transaction,
            },
        );
        await sequelize.query(
            'delete from exercise_progress where exercise_id = :exerciseId',
            {
                replacements: { exerciseId },
                transaction,
            },
        );
        await sequelize.query(
            'delete from vocabulary_items where exercise_id = :exerciseId',
            {
                replacements: { exerciseId },
                transaction,
            },
        );
        await ExerciseModel.destroy({
            where: { id: exerciseId },
            transaction,
        });
    });
}

export async function updateExerciseMedia(
    exerciseId: number,
    mediaType: ListeningExercise['mediaType'],
    audioUrl: string,
) {
    const existing = (await ExerciseModel.findOne({
        where: { id: exerciseId },
        attributes: ['audio_object_name', 'audio_url'],
        raw: true,
    })) as {
        audio_object_name?: string | null;
        audio_url?: string | null;
    } | null;

    if (!existing) {
        throw new Error('课程不存在');
    }

    const storedAudioUrl = toStoredMediaUrl(audioUrl);
    const newAudioObjectName = getObjectNameFromUrl(storedAudioUrl);
    await ExerciseModel.update(
        {
            media_type: mediaType,
            audio_object_name: newAudioObjectName || null,
            audio_url: storedAudioUrl,
        },
        {
            where: { id: exerciseId },
        },
    );

    // 媒体替换接口只修改媒体字段，避免上传文件时覆盖课程的元数据、发布状态或字幕。
    const oldAudioObjectName =
        existing.audio_object_name ||
        getObjectNameFromUrl(existing.audio_url ?? '');
    if (oldAudioObjectName && oldAudioObjectName !== newAudioObjectName) {
        try {
            await deleteMediaObject(oldAudioObjectName);
        } catch (error) {
            logger.warn(
                `清理旧课程媒体失败 object=${oldAudioObjectName}`,
                error,
            );
        }
    }
}

export async function upsertExercise(exercise: CreateExerciseRequest) {
    const existing = exercise.id
        ? ((await ExerciseModel.findOne({
              where: { id: exercise.id },
              // 取出旧的媒体 URL，用于更新后清理被替换掉的 MinIO 旧对象
              attributes: [
                  'transcript_json',
                  'localizations_json',
                  'audio_object_name',
                  'audio_url',
                  'cover_image_url',
              ],
              raw: true,
          })) as {
              transcript_json?: unknown;
              localizations_json?: unknown;
              audio_object_name?: string | null;
              audio_url?: string | null;
              cover_image_url?: string | null;
          } | null)
        : null;

    const storedAudioUrl = toStoredMediaUrl(exercise.audioUrl);
    const storedCoverImageUrl = toStoredMediaUrl(exercise.coverImageUrl);
    const audioObjectName = getObjectNameFromUrl(storedAudioUrl);

    const payload = {
        ...(exercise.id ? { id: exercise.id } : {}),
        category_id: exercise.categoryId,
        title: exercise.title,
        source: exercise.source,
        source_url: normalizeSourceUrl(exercise.sourceUrl),
        difficulty: exercise.difficulty,
        duration_label: exercise.durationLabel,
        media_type: exercise.mediaType,
        audio_object_name:
            audioObjectName || existing?.audio_object_name || null,
        audio_url: storedAudioUrl,
        cover_image_url: storedCoverImageUrl || null,
        summary: exercise.summary,
        localizations_json: exercise.localizations
            ? normalizeExerciseLocalizations(exercise.localizations)
            : (existing?.localizations_json ?? {}),
        transcript_json: existing?.transcript_json ?? [],
        sort_order: exercise.sortOrder,
        status: exercise.status,
    } as any;

    if (existing && exercise.id) {
        await ExerciseModel.upsert(payload);

        // 媒体/封面被替换后，删除 MinIO 中的旧对象，避免孤儿文件。
        // 仅当旧值非空、与新值不同、且能解析出本系统 MinIO 对象名时才删除；
        // 删除失败只记日志，不影响主流程（与 deleteExercise 的清理口径一致）。
        const oldAudioObjectName =
            existing.audio_object_name ||
            getObjectNameFromUrl(existing.audio_url ?? '');
        const newAudioObjectName =
            audioObjectName || getObjectNameFromUrl(storedAudioUrl);
        if (oldAudioObjectName && oldAudioObjectName !== newAudioObjectName) {
            try {
                await deleteMediaObject(oldAudioObjectName);
            } catch (error) {
                logger.warn(
                    `清理旧课程媒体失败 object=${oldAudioObjectName}`,
                    error,
                );
            }
        }
        const oldCoverObjectName = getObjectNameFromUrl(
            existing.cover_image_url ?? '',
        );
        const newCoverObjectName = getObjectNameFromUrl(storedCoverImageUrl);
        if (oldCoverObjectName && oldCoverObjectName !== newCoverObjectName) {
            try {
                await deleteMediaObject(oldCoverObjectName);
            } catch (error) {
                logger.warn(
                    `清理旧课程封面失败 object=${oldCoverObjectName}`,
                    error,
                );
            }
        }

        return Number(exercise.id);
    }

    // 直接使用 create 返回实例的 id；不能再按 (category_id,title,audio_url) 回查，
    // 并发下同标题课程会拿到别人的 id。
    //
    // sortOrder 兜底：admin 前端的"下一个排序值"是按本地已加载的课程列表算的，
    // 列表未加载/过期时会算出与现有课程重复的值。创建前在服务端校验——
    // 目标排序值在同系列内已被占用时，自动落到 max+10，保证系列内不重复。
    const sortOrderRows = await doRawQuery<{
        max_order: number | null;
        conflict: number;
    }>({
        query: 'select max(sort_order) as max_order, sum(sort_order = ?) as conflict from exercises where category_id = ?',
        params: [payload.sort_order, payload.category_id],
    });
    const maxOrder = sortOrderRows[0]?.max_order ?? 0;
    if (Number(sortOrderRows[0]?.conflict ?? 0) > 0) {
        payload.sort_order = maxOrder + 10;
    }

    const created = await ExerciseModel.create(payload);
    const createdId = (created as { id?: number | string }).id;

    if (!createdId) {
        throw new Error('课程创建成功，但未能读取新课程 ID');
    }

    return Number(createdId);
}

export async function replaceTranscriptLines(
    exerciseId: number,
    lines: CreateTranscriptLineRequest[],
    nextStatus?: ListeningExercise['status'],
) {
    const exercise = await ExerciseModel.findByPk(exerciseId, {
        attributes: ['id'],
    });
    if (!exercise) {
        throw new Error('课程不存在');
    }

    // MySQL updates that write identical JSON may report zero affected rows. The
    // existence check above distinguishes that harmless no-op from a missing course.
    await ExerciseModel.update(
        {
            transcript_json: serializeTranscriptLines(lines),
            // 字幕贡献者提交校对时和字幕内容一次写入，避免出现新字幕仍标记为已发布的短暂窗口。
            ...(nextStatus ? { status: nextStatus } : {}),
        } as any,
        {
            where: { id: exerciseId },
        },
    );
}
