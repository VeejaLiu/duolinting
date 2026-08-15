import express from 'express';
import { body } from 'express-validator';
import type { FeedbackStatus } from '../../domain';
import { requireAdminToken } from '../../general/admin/admin-auth';
import { getAdminInfo, loginAdmin, logoutAdmin } from '../../general/admin/admin-service';
import {
    deleteExercise,
    deleteCategory,
    deleteCategoryGroup,
    getExercise,
    listAllExercises,
    listAdminExercisesPage,
    listCatalog,
    replaceTranscriptLines,
    upsertCategory,
    upsertCategoryGroup,
    upsertExercise,
    updateExerciseMedia,
} from '../../general/catalog/catalog-service';
import {
    listAcceptedAnswerFeedback,
    updateAcceptedAnswerFeedbackStatus,
} from '../../general/feedback/feedback-service';
import { getAdminGrowthReport } from '../../general/admin/user-activity-service';
import { createTranslationJob, getTranslationJob } from '../../general/translate/translate-service';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';
import { Logger } from '../../lib/logger';
import { authenticationRateLimitKeys, createRateLimit } from '../../lib/rate-limit';

const router = express.Router();
const adminLoginRateLimit = createRateLimit({
    namespace: 'admin-login',
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
    keys: authenticationRateLimitKeys('username'),
});

const isStoredAssetUrl = (value: unknown) => {
    if (typeof value !== 'string') {
        return false;
    }

    if (value.startsWith('/api/v1/media/objects')) {
        return true;
    }

    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};
const logger = new Logger(__filename);
// Express 5 route params may be typed as string arrays for repeated parameters; IDs use the first value.
const toId = (value: string | string[]) => Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
router.post(
    '/auth/login',
    adminLoginRateLimit,
    body('username').isString().isLength({ min: 1 }),
    body('password').isString().isLength({ min: 1 }),
    validateErrorCheck,
    async (req, res) => {
        const result = await loginAdmin(req.body);
        res.status(result.success ? 200 : 401).send(result);
    },
);

router.get('/auth/me', requireAdminToken, async (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const result = await getAdminInfo(token);
    res.status(result.success ? 200 : 401).send(result);
});

router.post('/auth/logout', requireAdminToken, async (req, res) => {
    await logoutAdmin((req as any).admin.id);
    res.status(200).send({ success: true, message: 'success' });
});

router.use(requireAdminToken);

router.get('/catalog', async (req, res) => {
    res.status(200).send(await listCatalog(true, true));
});

router.get('/exercises', async (req, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
    const groupId = Number.parseInt(String(req.query.groupId ?? ''), 10);
    const categoryId = Number.parseInt(String(req.query.categoryId ?? ''), 10);
    const status = ['draft', 'published', 'archived'].includes(String(req.query.status))
        ? String(req.query.status) as 'draft' | 'published' | 'archived'
        : undefined;
    const search = String(req.query.search ?? '').trim().slice(0, 200);
    if (req.query.page !== undefined || req.query.pageSize !== undefined) {
        return res.status(200).send(await listAdminExercisesPage({
            page,
            pageSize,
            ...(Number.isInteger(groupId) && groupId > 0 ? { groupId } : {}),
            ...(Number.isInteger(categoryId) && categoryId > 0 ? { categoryId } : {}),
            ...(status ? { status } : {}),
            ...(search ? { search } : {}),
        }));
    }
    res.status(200).send(await listAllExercises());
});

router.get('/exercises/:exerciseId', async (req, res) => {
    const exerciseId = toId(req.params.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid exercise id' });
    }

    const exercise = await getExercise(exerciseId, true);
    if (!exercise) {
        return res.status(404).send({ success: false, message: 'Exercise not found' });
    }

    res.status(200).send(exercise);
});

router.post(
    '/category-groups',
    body('id').optional().isInt({ min: 1 }),
    body('name').isString().isLength({ min: 1 }),
    body('description').optional().isString(),
    body('accent').isString().matches(/^#[0-9a-fA-F]{6}$/),
    body('coverImageUrl').optional({ values: 'falsy' }).custom(isStoredAssetUrl),
    body('sortOrder').isInt({ min: 0 }),
    validateErrorCheck,
    async (req, res) => {
        await upsertCategoryGroup(req.body);
        res.status(201).send({ ok: true });
    },
);

router.delete('/category-groups/:groupId', async (req, res) => {
    try {
        const groupId = toId(req.params.groupId);
        if (!Number.isInteger(groupId) || groupId <= 0) {
            return res.status(400).send({ ok: false, message: '无效的分类 ID' });
        }

        await deleteCategoryGroup(groupId);
        res.status(200).send({ ok: true });
    } catch (error) {
        res.status(409).send({
            ok: false,
            message: error instanceof Error ? error.message : '分类删除失败',
        });
    }
});

router.post(
    '/categories',
    body('id').optional().isInt({ min: 1 }),
    body('groupId').isInt({ min: 1 }),
    body('name').isString().isLength({ min: 1 }),
    body('description').optional().isString(),
    body('accent').isString().matches(/^#[0-9a-fA-F]{6}$/),
    body('coverImageUrl').optional({ values: 'falsy' }).custom(isStoredAssetUrl),
    body('sortOrder').isInt({ min: 0 }),
    validateErrorCheck,
    async (req, res) => {
        await upsertCategory(req.body);
        res.status(201).send({ ok: true });
    },
);

router.delete('/categories/:categoryId', async (req, res) => {
    try {
        const categoryId = toId(req.params.categoryId);
        if (!Number.isInteger(categoryId) || categoryId <= 0) {
            return res.status(400).send({ ok: false, message: '无效的系列 ID' });
        }

        await deleteCategory(categoryId);
        res.status(200).send({ ok: true });
    } catch (error) {
        res.status(409).send({
            ok: false,
            message: error instanceof Error ? error.message : '学习系列删除失败',
        });
    }
});

router.delete('/exercises/:exerciseId', async (req, res) => {
    try {
        const exerciseId = toId(req.params.exerciseId);
        if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
            return res.status(400).send({ ok: false, message: '无效的课程 ID' });
        }

        await deleteExercise(exerciseId);
        res.status(200).send({ ok: true });
    } catch (error) {
        res.status(409).send({
            ok: false,
            message: error instanceof Error ? error.message : '课程删除失败',
        });
    }
});

router.post(
    '/exercises',
    body('id').optional().isInt({ min: 1 }),
    body('categoryId').isInt({ min: 1 }),
    body('title').isString().isLength({ min: 1 }),
    body('source').optional().isString(),
    body('difficulty').isIn(['beginner', 'intermediate', 'advanced']),
    // 上传媒体后可先保存课程；时长尚未解析完成时允许为空字符串，后续由媒体元数据补全。
    body('durationLabel').isString(),
    body('mediaType').isIn(['audio', 'video']),
    body('audioUrl').custom(isStoredAssetUrl),
    body('coverImageUrl').optional({ values: 'falsy' }).custom(isStoredAssetUrl),
    body('summary').optional().isString(),
    body('sortOrder').isInt({ min: 0 }),
    body('status').isIn(['draft', 'published', 'archived']),
    validateErrorCheck,
    async (req, res) => {
        const id = await upsertExercise(req.body);
        res.status(201).send({ ok: true, id });
    },
);

router.put(
    '/exercises/:exerciseId/media',
    body('mediaType').isIn(['audio', 'video']),
    body('audioUrl').custom(isStoredAssetUrl),
    validateErrorCheck,
    async (req, res) => {
        const exerciseId = toId(req.params.exerciseId);
        if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
            return res.status(400).send({ ok: false, message: '无效的课程 ID' });
        }

        await updateExerciseMedia(exerciseId, req.body.mediaType, req.body.audioUrl);
        res.status(200).send({ ok: true, id: exerciseId });
    },
);

router.put('/exercises/:exerciseId/transcript', async (req, res) => {
    const exerciseId = toId(req.params.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid exercise id' });
    }

    const lines = req.body?.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).send({ success: false, message: 'Invalid transcript payload' });
    }

    // 显式校验每行：start/end 必须是有限数且 end > start（Number(...) 对 NaN 会放行），text 非空
    const invalidRange = lines.find((line) => {
        const start = Number(line.start);
        const end = Number(line.end);
        return !Number.isFinite(start)
            || !Number.isFinite(end)
            || end <= start
            || !String(line.text ?? '').trim();
    });
    if (invalidRange) {
        return res.status(400).send({ success: false, message: `Line ${invalidRange.id} must end after it starts and have non-empty text` });
    }

    try {
        await replaceTranscriptLines(exerciseId, lines);
        res.status(200).send({ ok: true });
    } catch (error) {
        // service 层在课程不存在（update 影响 0 行）时抛出「课程不存在」
        if (error instanceof Error && error.message === '课程不存在') {
            return res.status(404).send({ success: false, message: error.message });
        }
        throw error;
    }
});

router.post(
    '/translate',
    // 前端将整课字幕拆分为小批次；限制单请求规模，确保模型调用不会拖到网关超时。
    body('lines').isArray({ min: 1, max: 12 }),
    body('lines.*').isString().isLength({ min: 1, max: 1000 }),
    body('sourceLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP']),
    body('targetLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP']),
    validateErrorCheck,
    async (req, res) => {
        const lines: string[] = req.body.lines;
        logger.info(`AI 翻译请求: lines=${lines.length}, adminId=${(req as any).admin?.id ?? '-'}`);
        const jobId = createTranslationJob(lines, req.body.sourceLocale, req.body.targetLocale);
        res.status(202).send({ success: true, data: { jobId } });
    },
);

router.get('/translate/:jobId', async (req, res) => {
    const job = getTranslationJob(req.params.jobId);
    if (!job) {
        return res.status(404).send({ success: false, message: '翻译任务不存在或已过期' });
    }

    res.status(200).send({ success: true, data: job });
});

router.get('/feedback/accepted-answer', async (req, res) => {
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : '';
    const status = rawStatus === 'open' || rawStatus === 'reviewed' || rawStatus === 'dismissed'
        ? rawStatus
        : undefined;
    const items = await listAcceptedAnswerFeedback(status);
    res.status(200).send({ items });
});

router.get('/analytics/growth', async (_req, res) => {
    res.status(200).send(await getAdminGrowthReport());
});

router.put(
    '/feedback/accepted-answer/:feedbackId/status',
    body('status').isIn(['open', 'reviewed', 'dismissed']),
    validateErrorCheck,
    async (req, res) => {
        const feedbackIdParam = Array.isArray(req.params.feedbackId)
            ? req.params.feedbackId[0]
            : req.params.feedbackId;
        const feedbackId = toId(feedbackIdParam);
        if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
            return res.status(400).send({ success: false, message: 'Invalid feedback id' });
        }

        const status = req.body.status;
        if (typeof status !== 'string') {
            return res.status(400).send({ success: false, message: 'Invalid feedback status' });
        }

        await updateAcceptedAnswerFeedbackStatus(feedbackId, status as FeedbackStatus);
        res.status(200).send({ ok: true });
    },
);

export default router;
