import type {
    CatalogExerciseSummary,
    CatalogResponse,
    ContentLocale,
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
} from '../../domain';
import { env } from '../../env';
import { deleteMediaObject, statMediaObject } from '../media/media-service';
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
};

const supportedContentLocales = new Set<ContentLocale>(['zh-CN', 'en-US', 'th-TH', 'ja-JP']);

export const parseContentLocale = (value: unknown): ContentLocale | undefined => {
    const locale = typeof value === 'string' ? value.trim() : '';
    return supportedContentLocales.has(locale as ContentLocale) ? locale as ContentLocale : undefined;
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
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
};

const normalizeTranslations = (value: unknown) => Object.fromEntries(
    Object.entries(parseJsonObject(value))
        .filter(([locale, translation]) => supportedContentLocales.has(locale as ContentLocale) && typeof translation === 'string')
        .map(([locale, translation]) => [locale, cleanSubtitleSpacing(translation as string)])
        .filter(([, translation]) => Boolean(translation)),
) as Partial<Record<ContentLocale, string>>;

const normalizeDirectoryLocalizations = (value: unknown) => Object.fromEntries(
    Object.entries(parseJsonObject(value))
        .filter(([locale, item]) => supportedContentLocales.has(locale as ContentLocale) && item && typeof item === 'object')
        .map(([locale, item]) => {
            const source = item as Record<string, unknown>;
            const normalized: LocalizedDirectoryContent = {
                ...(typeof source.name === 'string' && source.name.trim() ? { name: source.name.trim() } : {}),
                ...(typeof source.description === 'string' && source.description.trim() ? { description: source.description.trim() } : {}),
            };
            return [locale, normalized];
        })
        .filter(([, item]) => Object.keys(item as object).length > 0),
) as Partial<Record<ContentLocale, LocalizedDirectoryContent>>;

const normalizeExerciseLocalizations = (value: unknown) => Object.fromEntries(
    Object.entries(parseJsonObject(value))
        .filter(([locale, item]) => supportedContentLocales.has(locale as ContentLocale) && item && typeof item === 'object')
        .map(([locale, item]) => {
            const source = item as Record<string, unknown>;
            const normalized: LocalizedExerciseContent = {
                ...(typeof source.title === 'string' && source.title.trim() ? { title: source.title.trim() } : {}),
                ...(typeof source.summary === 'string' && source.summary.trim() ? { summary: source.summary.trim() } : {}),
            };
            return [locale, normalized];
        })
        .filter(([, item]) => Object.keys(item as object).length > 0),
) as Partial<Record<ContentLocale, LocalizedExerciseContent>>;

const loadMediaSize = async (row: ExerciseRow) => {
    const objectName = row.audio_object_name || getObjectNameFromUrl(row.audio_url ?? '');
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

const cleanSubtitleSpacing = (value: string) => value.replace(/[ \t\u00a0\u3000]+/g, ' ').trim();

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

const normalizeTranscriptLine = (line: unknown, index: number, contentLocale?: ContentLocale): TranscriptLine | null => {
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
    const legacyTranslation = cleanSubtitleSpacing(String(item.translation ?? ''));
    // During rollout legacy JSON only has translation. Once translations exists,
    // it is authoritative and the old API field is derived for Mobile clients.
    if (!translations['zh-CN'] && legacyTranslation) {
        translations['zh-CN'] = legacyTranslation;
    }
    const resolvedTranslation = contentLocale
        ? translations[contentLocale] ?? translations['zh-CN'] ?? ''
        : translations['zh-CN'] ?? legacyTranslation;

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

const parseTranscriptJson = (value: unknown, contentLocale?: ContentLocale): TranscriptLine[] => {
    if (Array.isArray(value)) {
        return value
            .map((line, index) => normalizeTranscriptLine(line, index, contentLocale))
            .filter((line): line is TranscriptLine => Boolean(line));
    }

    if (typeof value !== 'string' || !value.trim()) {
        return [];
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed)
            ? parsed
                  .map((line, index) => normalizeTranscriptLine(line, index, contentLocale))
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
            ...(!line.translations?.['zh-CN'] && line.translation ? { 'zh-CN': line.translation } : {}),
        }),
        ...(line.translation ? { translation: cleanSubtitleSpacing(String(line.translation)) } : {}),
        answers: parseStringList(line.answers, cleanEnglishAnswerText),
        keywords: parseStringList(line.keywords),
    }));

const toStoredMediaUrl = (value: string | null | undefined) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
        return '';
    }

    try {
        const parsed = new URL(rawValue, env.app.backend_url);
        if (parsed.pathname === '/api/v1/media/objects') {
            return `${parsed.pathname}${parsed.search}`;
        }

        const marker = '/api/v1/media/objects/';
        if (parsed.pathname.startsWith(marker)) {
            return parsed.pathname;
        }
    } catch {
        // Fall through to string matching for malformed legacy values.
    }

    const queryMarker = '/api/v1/media/objects?';
    const queryMarkerIndex = rawValue.indexOf(queryMarker);
    if (queryMarkerIndex >= 0) {
        return rawValue.slice(queryMarkerIndex);
    }

    const pathMarker = '/api/v1/media/objects/';
    const pathMarkerIndex = rawValue.indexOf(pathMarker);
    if (pathMarkerIndex >= 0) {
        return rawValue.slice(pathMarkerIndex);
    }

    return rawValue;
};

const getObjectNameFromUrl = (audioUrl: string) => {
    try {
        const parsed = new URL(audioUrl, env.app.backend_url);
        const objectKey = parsed.searchParams.get('key');
        if (objectKey) {
            return objectKey;
        }
    } catch {
        // Fall through to legacy path parsing for relative or invalid URLs.
    }

    const marker = '/api/v1/media/objects/';
    const markerIndex = audioUrl.indexOf(marker);
    if (markerIndex < 0) {
        return '';
    }

    const objectName = audioUrl.slice(markerIndex + marker.length);
    try {
        return decodeURIComponent(objectName);
    } catch {
        return objectName;
    }
};

const buildExerciseSummary = (
    row: ExerciseRow,
    lineCount: number,
    contentLocale?: ContentLocale,
): CatalogExerciseSummary => ({
    id: Number(row.id),
    categoryId: Number(row.category_id),
    title: contentLocale ? normalizeExerciseLocalizations(row.localizations_json)[contentLocale]?.title ?? row.title : row.title,
    source: row.source,
    difficulty: row.difficulty,
    durationLabel: row.duration_label,
    mediaType: row.media_type ?? 'audio',
    audioUrl: toStoredMediaUrl(row.audio_url),
    coverImageUrl: toStoredMediaUrl(row.cover_image_url) || undefined,
    summary: contentLocale ? normalizeExerciseLocalizations(row.localizations_json)[contentLocale]?.summary ?? row.summary : row.summary,
    status: row.status,
    sortOrder: Number(row.sort_order ?? 0),
    lineCount,
    localizations: normalizeExerciseLocalizations(row.localizations_json),
});

const buildExerciseDetail = (
    row: ExerciseRow,
    lines: TranscriptLine[],
    mediaSize?: number,
    contentLocale?: ContentLocale,
): ListeningExercise => ({
    id: Number(row.id),
    categoryId: Number(row.category_id),
    title: contentLocale ? normalizeExerciseLocalizations(row.localizations_json)[contentLocale]?.title ?? row.title : row.title,
    source: row.source,
    difficulty: row.difficulty,
    durationLabel: row.duration_label,
    mediaType: row.media_type ?? 'audio',
    audioUrl: toStoredMediaUrl(row.audio_url),
    mediaSize,
    coverImageUrl: toStoredMediaUrl(row.cover_image_url) || undefined,
    summary: contentLocale ? normalizeExerciseLocalizations(row.localizations_json)[contentLocale]?.summary ?? row.summary : row.summary,
    status: row.status,
    sortOrder: Number(row.sort_order ?? 0),
    lines,
    localizations: normalizeExerciseLocalizations(row.localizations_json),
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
                  sort_order
                from categories
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

const loadCategoryIdsWithExercises = async (includeDrafts = false) => {
    const statusFilter = includeDrafts ? '' : `where status = 'published'`;
    const rows = await doRawQuery<any>({
        query: `
            select distinct category_id
            from exercises
            ${statusFilter}
        `,
    });

    return new Set((rows as Array<{ category_id: number | string }>).map((row) => Number(row.category_id)));
};

export async function listCatalog(
    includeDrafts = false,
    includeEmptyDirectories = false,
    contentLocale?: ContentLocale,
): Promise<CatalogResponse> {
    try {
        const categoryGroupRows = await loadCategoryGroupRows();
        const categoryRows = await loadCategoryRows();
        const categoryIdsWithExercises = await loadCategoryIdsWithExercises(includeDrafts);

        const mappedCategories: ExerciseCategory[] = categoryRows
            .map((row: any) => ({
                id: Number(row.id),
                groupId: Number(row.group_id),
                name: contentLocale ? normalizeDirectoryLocalizations(row.localizations_json)[contentLocale]?.name ?? row.name : row.name,
                description: contentLocale ? normalizeDirectoryLocalizations(row.localizations_json)[contentLocale]?.description ?? row.description : row.description,
                accent: row.accent,
                coverImageUrl: toStoredMediaUrl(row.cover_image_url) || undefined,
                sortOrder: Number(row.sort_order ?? 0),
                localizations: normalizeDirectoryLocalizations(row.localizations_json),
            }));
        // Learners should only see series with content; administrators must also
        // manage newly created, currently empty categories and groups.
        const categories = includeEmptyDirectories
            ? mappedCategories
            : mappedCategories.filter((category) => categoryIdsWithExercises.has(category.id));
        const visibleGroupIds = new Set(categories.map((category) => category.groupId));

        const categoryGroups: MaterialCategory[] = categoryGroupRows
            .map((row: any) => ({
                id: Number(row.id),
                name: contentLocale ? normalizeDirectoryLocalizations(row.localizations_json)[contentLocale]?.name ?? row.name : row.name,
                description: contentLocale ? normalizeDirectoryLocalizations(row.localizations_json)[contentLocale]?.description ?? row.description : row.description,
                accent: row.accent,
                coverImageUrl: toStoredMediaUrl(row.cover_image_url) || undefined,
                sortOrder: Number(row.sort_order ?? 0),
                localizations: normalizeDirectoryLocalizations(row.localizations_json),
            }))
            .filter((group) => includeEmptyDirectories || visibleGroupIds.has(group.id));

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
): Promise<CatalogExerciseSummary[]> {
    const statusFilter = includeDrafts ? '' : `and status = 'published'`;

    try {
        const exerciseRows = await doRawQuery<any>({
            query: `
                select
                  id,
                  category_id,
                  title,
                  source,
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
    status?: 'draft' | 'published' | 'archived';
    search?: string;
    page: number;
    pageSize: number;
};

export async function listAdminExercisesPage(options: AdminExercisePageOptions) {
    const conditions: string[] = [];
    const replacements: Record<string, string | number> = {};
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
    if (options.search) {
        // Search only operator-facing fields; the bound parameter prevents SQL injection.
        conditions.push('(e.title like :search or e.source like :search or e.summary like :search)');
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
            select e.id, e.category_id, e.title, e.source, e.difficulty, e.duration_label,
                   e.media_type, e.audio_url, e.audio_object_name, e.cover_image_url, e.summary,
                   e.transcript_json, e.status, e.sort_order, e.created_at
            from exercises e inner join categories c on c.id = e.category_id
            ${where}
            order by e.sort_order asc, e.created_at desc, e.title asc
            limit :limit offset :offset
        `,
        params: { ...replacements, limit: options.pageSize, offset },
    });

    return {
        items: rows.map((row) => buildExerciseSummary(row, parseTranscriptJson(row.transcript_json).length)),
        page: options.page,
        pageSize: options.pageSize,
        total,
    };
}

export async function getExercise(
    exerciseId: number,
    includeDrafts = false,
    contentLocale?: ContentLocale,
) {
    const rows = await doRawQuery<ExerciseRow>({
        query: `
            select
              id,
              category_id,
              title,
              source,
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
              ${includeDrafts ? '' : `and status = 'published'`}
            limit 1
        `,
        params: [exerciseId],
    });

    const row = rows[0];
    if (!row) {
        return null;
    }

    const mediaSize = await loadMediaSize(row);
    return buildExerciseDetail(
        row,
        parseTranscriptJson(row.transcript_json, contentLocale),
        mediaSize,
        contentLocale,
    );
}

export async function upsertCategory(category: CreateCategoryRequest) {
    const payload = {
        ...(category.id ? { id: category.id } : {}),
        group_id: category.groupId,
        name: category.name,
        description: category.description,
        localizations_json: normalizeDirectoryLocalizations(category.localizations),
        accent: category.accent,
        cover_image_url: toStoredMediaUrl(category.coverImageUrl) || null,
        sort_order: category.sortOrder,
    } as any;

    await CategoryModel.upsert(payload);
}

export async function upsertCategoryGroup(group: CreateCategoryGroupRequest) {
    await CategoryGroupModel.upsert({
        ...(group.id ? { id: group.id } : {}),
        name: group.name,
        description: group.description,
        localizations_json: normalizeDirectoryLocalizations(group.localizations),
        accent: group.accent,
        cover_image_url: toStoredMediaUrl(group.coverImageUrl) || null,
        sort_order: group.sortOrder,
    } as any);
}

export async function deleteCategoryGroup(groupId: number) {
    const group = await CategoryGroupModel.findOne({
        where: { id: groupId },
        attributes: ['cover_image_url'],
        raw: true,
    }) as { cover_image_url?: string | null } | null;
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
    const category = await CategoryModel.findOne({
        where: { id: categoryId },
        attributes: ['cover_image_url'],
        raw: true,
    }) as { cover_image_url?: string | null } | null;
    const exerciseCount = await ExerciseModel.count({
        where: { category_id: categoryId },
    });

    if (exerciseCount > 0) {
        throw new Error('请先删除或移动这个学习系列下的课程');
    }

    await CategoryModel.destroy({
        where: { id: categoryId },
    });

    const coverObjectName = getObjectNameFromUrl(category?.cover_image_url ?? '');
    if (coverObjectName) {
        await deleteMediaObject(coverObjectName);
    }
}

export async function deleteExercise(exerciseId: number) {
    const exercise = await ExerciseModel.findOne({
        where: { id: exerciseId },
        attributes: ['audio_object_name', 'audio_url', 'cover_image_url'],
        raw: true,
    }) as {
        audio_object_name?: string | null;
        audio_url?: string | null;
        cover_image_url?: string | null;
    } | null;

    if (!exercise) {
        throw new Error('课程不存在');
    }

    const objectName = exercise.audio_object_name || getObjectNameFromUrl(exercise.audio_url ?? '');
    if (objectName) {
        await deleteMediaObject(objectName);
    }
    const coverObjectName = getObjectNameFromUrl(exercise.cover_image_url ?? '');
    if (coverObjectName) {
        await deleteMediaObject(coverObjectName);
    }

    await sequelize.transaction(async (transaction) => {
        await sequelize.query('delete from line_progress where exercise_id = :exerciseId', {
            replacements: { exerciseId },
            transaction,
        });
        await sequelize.query('delete from exercise_progress where exercise_id = :exerciseId', {
            replacements: { exerciseId },
            transaction,
        });
        await sequelize.query('delete from vocabulary_items where exercise_id = :exerciseId', {
            replacements: { exerciseId },
            transaction,
        });
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
    const existing = await ExerciseModel.findOne({
        where: { id: exerciseId },
        attributes: ['audio_object_name', 'audio_url'],
        raw: true,
    }) as {
        audio_object_name?: string | null;
        audio_url?: string | null;
    } | null;

    if (!existing) {
        throw new Error('课程不存在');
    }

    const storedAudioUrl = toStoredMediaUrl(audioUrl);
    const newAudioObjectName = getObjectNameFromUrl(storedAudioUrl);
    await ExerciseModel.update({
        media_type: mediaType,
        audio_object_name: newAudioObjectName || null,
        audio_url: storedAudioUrl,
    }, {
        where: { id: exerciseId },
    });

    // 媒体替换接口只修改媒体字段，避免上传文件时覆盖课程的元数据、发布状态或字幕。
    const oldAudioObjectName = existing.audio_object_name || getObjectNameFromUrl(existing.audio_url ?? '');
    if (oldAudioObjectName && oldAudioObjectName !== newAudioObjectName) {
        try {
            await deleteMediaObject(oldAudioObjectName);
        } catch (error) {
            logger.warn(`清理旧课程媒体失败 object=${oldAudioObjectName}`, error);
        }
    }
}

export async function upsertExercise(exercise: CreateExerciseRequest) {
    const existing = exercise.id ? await ExerciseModel.findOne({
        where: { id: exercise.id },
        // 取出旧的媒体 URL，用于更新后清理被替换掉的 MinIO 旧对象
        attributes: ['transcript_json', 'localizations_json', 'audio_object_name', 'audio_url', 'cover_image_url'],
        raw: true,
    }) as {
        transcript_json?: unknown;
        localizations_json?: unknown;
        audio_object_name?: string | null;
        audio_url?: string | null;
        cover_image_url?: string | null;
    } | null : null;

    const storedAudioUrl = toStoredMediaUrl(exercise.audioUrl);
    const storedCoverImageUrl = toStoredMediaUrl(exercise.coverImageUrl);
    const audioObjectName = getObjectNameFromUrl(storedAudioUrl);

    const payload = {
        ...(exercise.id ? { id: exercise.id } : {}),
        category_id: exercise.categoryId,
        title: exercise.title,
        source: exercise.source,
        difficulty: exercise.difficulty,
        duration_label: exercise.durationLabel,
        media_type: exercise.mediaType,
        audio_object_name: audioObjectName || existing?.audio_object_name || null,
        audio_url: storedAudioUrl,
        cover_image_url: storedCoverImageUrl || null,
        summary: exercise.summary,
        localizations_json: exercise.localizations
            ? normalizeExerciseLocalizations(exercise.localizations)
            : existing?.localizations_json ?? {},
        transcript_json: existing?.transcript_json ?? [],
        sort_order: exercise.sortOrder,
        status: exercise.status,
    } as any;

    if (existing && exercise.id) {
        await ExerciseModel.upsert(payload);

        // 媒体/封面被替换后，删除 MinIO 中的旧对象，避免孤儿文件。
        // 仅当旧值非空、与新值不同、且能解析出本系统 MinIO 对象名时才删除；
        // 删除失败只记日志，不影响主流程（与 deleteExercise 的清理口径一致）。
        const oldAudioObjectName = existing.audio_object_name || getObjectNameFromUrl(existing.audio_url ?? '');
        const newAudioObjectName = audioObjectName || getObjectNameFromUrl(storedAudioUrl);
        if (oldAudioObjectName && oldAudioObjectName !== newAudioObjectName) {
            try {
                await deleteMediaObject(oldAudioObjectName);
            } catch (error) {
                logger.warn(`清理旧课程媒体失败 object=${oldAudioObjectName}`, error);
            }
        }
        const oldCoverObjectName = getObjectNameFromUrl(existing.cover_image_url ?? '');
        const newCoverObjectName = getObjectNameFromUrl(storedCoverImageUrl);
        if (oldCoverObjectName && oldCoverObjectName !== newCoverObjectName) {
            try {
                await deleteMediaObject(oldCoverObjectName);
            } catch (error) {
                logger.warn(`清理旧课程封面失败 object=${oldCoverObjectName}`, error);
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
    const sortOrderRows = await doRawQuery<{ max_order: number | null; conflict: number }>({
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

export async function replaceTranscriptLines(exerciseId: number, lines: CreateTranscriptLineRequest[]) {
    const exercise = await ExerciseModel.findByPk(exerciseId, {
        attributes: ['id'],
    });
    if (!exercise) {
        throw new Error('课程不存在');
    }

    // MySQL updates that write identical JSON may report zero affected rows. The
    // existence check above distinguishes that harmless no-op from a missing course.
    await ExerciseModel.update({
        transcript_json: serializeTranscriptLines(lines),
    } as any, {
        where: { id: exerciseId },
    });
}
