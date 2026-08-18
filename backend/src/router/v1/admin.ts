import express from 'express';
import { body } from 'express-validator';
import type { FeedbackStatus } from '../../domain';
import { requireAdminPasswordChanged, requireAdminToken, requireSuperAdmin } from '../../general/admin/admin-auth';
import { changeAdminPassword, getAdminInfo, loginAdmin, logoutAdmin } from '../../general/admin/admin-service';
import {
    canAccessExerciseWorkflow,
    canEditExerciseSubtitles,
    canReviewSubtitleDraft,
    canSubmitSubtitleDraft,
    approveSubtitleDraft,
    createAdminMember,
    forceAdminMemberPasswordChange,
    getAssignedExerciseIds,
    isSuperAdmin,
    listAdminMembers,
    listMySubtitleReviewTasks,
    listMyWorkflowNotifications,
    listPreviewVolunteers,
    markMyWorkflowNotificationsRead,
    returnSubtitleDraft,
    resetAdminMemberPassword,
    revokeAdminMemberSessions,
    saveSubtitleDraft,
    submitSubtitleDraft,
    replaceContributorAssignments,
    updateExerciseWorkflowAssignee,
    updateAdminMemberProfile,
    setAdminMemberActive,
    updatePreviewVolunteer,
} from '../../general/admin/collaboration-service';
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
import { doRawQuery } from '../../models';
import { authenticationRateLimitKeys, createRateLimit } from '../../lib/rate-limit';

const router = express.Router();
const adminLoginRateLimit = createRateLimit({
    namespace: 'admin-login',
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
    keys: authenticationRateLimitKeys('email'),
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
    // 新成员使用邮箱登录；旧管理员若仍是历史账户名，允许在过渡期继续登录。
    body('email').isString().trim().isLength({ min: 1, max: 255 }),
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

router.put(
    '/auth/password',
    requireAdminToken,
    body('currentPassword').isString().isLength({ min: 1, max: 200 }),
    body('newPassword').isString().isLength({ min: 8, max: 200 }),
    validateErrorCheck,
    async (req: any, res) => {
        const result = await changeAdminPassword({
            adminId: req.admin.id,
            currentPassword: req.body.currentPassword,
            newPassword: req.body.newPassword,
        });
        res.status(result.success ? 200 : 400).send(result);
    },
);

// 除了认证资料和改密接口外，所有后台能力都要求成员完成初始密码修改。
router.use(requireAdminToken, requireAdminPasswordChanged);

router.get('/catalog', async (_req: any, res) => {
    res.status(200).send(await listCatalog(true, true));
});

/** 当前成员的站内工作流消息；已读状态由调用方显式确认，避免打开课程就丢失提醒。 */
router.get('/workflow-notifications', async (req: any, res) => {
    res.status(200).send(await listMyWorkflowNotifications(req.admin.id));
});

router.put(
    '/workflow-notifications/read',
    body('notificationIds').optional().isArray(),
    body('notificationIds.*').optional().isInt({ min: 1 }),
    validateErrorCheck,
    async (req: any, res) => {
        await markMyWorkflowNotificationsRead(req.admin.id, req.body.notificationIds);
        res.status(200).send({ ok: true });
    },
);

/** 二审任务只返回给提交时已接收该稿件的审核人。 */
router.get('/subtitle-review-tasks', async (req: any, res) => {
    res.status(200).send({ items: await listMySubtitleReviewTasks(req.admin.id) });
});

router.get('/exercises', async (req: any, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
    const groupId = Number.parseInt(String(req.query.groupId ?? ''), 10);
    const categoryId = Number.parseInt(String(req.query.categoryId ?? ''), 10);
    const status = ['draft', 'proofread', 'published', 'archived'].includes(String(req.query.status))
        ? String(req.query.status) as 'draft' | 'proofread' | 'published' | 'archived'
        : undefined;
    const search = String(req.query.search ?? '').trim().slice(0, 200);
    if (req.query.page !== undefined || req.query.pageSize !== undefined) {
        const assignedExerciseIds = isSuperAdmin(req.admin)
            ? undefined
            : await getAssignedExerciseIds(req.admin.id);
        return res.status(200).send(await listAdminExercisesPage({
            page,
            pageSize,
            ...(Number.isInteger(groupId) && groupId > 0 ? { groupId } : {}),
            ...(Number.isInteger(categoryId) && categoryId > 0 ? { categoryId } : {}),
            ...(status ? { status } : {}),
            ...(search ? { search } : {}),
            ...(assignedExerciseIds ? { assignedExerciseIds } : {}),
        }));
    }
    if (!isSuperAdmin(req.admin)) {
        const assignedExerciseIds = await getAssignedExerciseIds(req.admin.id);
        const page = await listAdminExercisesPage({ page: 1, pageSize: 100, assignedExerciseIds });
        return res.status(200).send(page.items);
    }
    res.status(200).send(await listAllExercises());
});

router.get('/exercises/:exerciseId', async (req: any, res) => {
    const exerciseId = toId(req.params.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid exercise id' });
    }
    if (!(await canAccessExerciseWorkflow(req.admin, exerciseId))) {
        return res.status(403).send({ success: false, message: 'This course is not assigned to you' });
    }

    const exercise = await getExercise(exerciseId, true, undefined, false, req.admin);
    if (!exercise) {
        return res.status(404).send({ success: false, message: 'Exercise not found' });
    }

    res.status(200).send(exercise);
});

router.post(
    '/category-groups',
    requireSuperAdmin,
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

router.delete('/category-groups/:groupId', requireSuperAdmin, async (req, res) => {
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
    requireSuperAdmin,
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

router.delete('/categories/:categoryId', requireSuperAdmin, async (req, res) => {
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

router.delete('/exercises/:exerciseId', requireSuperAdmin, async (req, res) => {
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
    requireSuperAdmin,
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
    body('status').isIn(['draft', 'proofread', 'published', 'archived']),
    validateErrorCheck,
    async (req, res) => {
        const requestedStatus = req.body.status;
        const existing = req.body.id ? await getExercise(Number(req.body.id), true) : null;
        // 发布只能经过下方专用的二次审核接口；普通保存只允许保留已有状态、创建草稿或归档。
        if (requestedStatus === 'published' && existing?.status !== 'published') {
            return res.status(409).send({ success: false, message: '请先完成二次审核后再发布课程' });
        }
        if (requestedStatus === 'proofread' && existing?.status !== 'proofread') {
            return res.status(409).send({ success: false, message: '已校对状态只能由字幕贡献者提交字幕时产生' });
        }
        const id = await upsertExercise(req.body);
        res.status(201).send({ ok: true, id });
    },
);

router.put(
    '/exercises/:exerciseId/media',
    requireSuperAdmin,
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

router.put('/exercises/:exerciseId/transcript', async (req: any, res) => {
    const exerciseId = toId(req.params.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid exercise id' });
    }
    if (!(await canEditExerciseSubtitles(req.admin, exerciseId))) {
        return res.status(403).send({ success: false, message: 'This course is not assigned to you' });
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
        // 超级管理员维护课程正式字幕；贡献者此接口只保存个人工作稿，
        // 永远不会改变课程发布状态或覆盖当前学习端版本。
        if (isSuperAdmin(req.admin)) {
            await replaceTranscriptLines(exerciseId, lines);
        } else {
            await saveSubtitleDraft({ exerciseId, adminId: req.admin.id, lines });
        }
        res.status(200).send({ ok: true });
    } catch (error) {
        // service 层在课程不存在（update 影响 0 行）时抛出「课程不存在」
        if (error instanceof Error && error.message === '课程不存在') {
            return res.status(404).send({ success: false, message: error.message });
        }
        throw error;
    }
});

router.post('/exercises/:exerciseId/subtitle-drafts/submit', async (req: any, res) => {
    const exerciseId = toId(req.params.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid exercise id' });
    }
    if (!(await canSubmitSubtitleDraft(req.admin, exerciseId))) {
        return res.status(403).send({ success: false, message: 'You are not the assigned proofreader for this course' });
    }
    const lines = req.body?.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).send({ success: false, message: 'Invalid transcript payload' });
    }
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
    await submitSubtitleDraft({ exerciseId, adminId: req.admin.id, lines });
    res.status(200).send({ ok: true });
});

router.post(
    '/translate',
    // 前端将整课字幕拆分为小批次；限制单请求规模，确保模型调用不会拖到网关超时。
    body('lines').isArray({ min: 1, max: 12 }),
    body('lines.*').isString().isLength({ min: 1, max: 1000 }),
    body('sourceLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP']),
    body('targetLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP']),
    validateErrorCheck,
    async (req: any, res) => {
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

router.get('/feedback/accepted-answer', requireSuperAdmin, async (req, res) => {
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : '';
    const status = rawStatus === 'open' || rawStatus === 'reviewed' || rawStatus === 'dismissed'
        ? rawStatus
        : undefined;
    const items = await listAcceptedAnswerFeedback(status);
    res.status(200).send({ items });
});

router.get('/analytics/growth', requireSuperAdmin, async (_req, res) => {
    res.status(200).send(await getAdminGrowthReport());
});

router.put(
    '/feedback/accepted-answer/:feedbackId/status',
    requireSuperAdmin,
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

router.get('/collaboration/members', requireSuperAdmin, async (_req, res) => {
    res.status(200).send({ items: await listAdminMembers() });
});

router.post(
    '/collaboration/members',
    requireSuperAdmin,
    body('email').isEmail().normalizeEmail(),
    body('displayName').isString().trim().isLength({ min: 1, max: 120 }),
    body('role').isIn(['super_admin', 'subtitle_contributor']),
    validateErrorCheck,
    async (req, res) => {
        const member = await createAdminMember(req.body);
        res.status(201).send({ ok: true, member });
    },
);

router.put(
    '/collaboration/members/:memberId/assignments',
    requireSuperAdmin,
    body('exerciseIds').isArray(),
    body('exerciseIds.*').isInt({ min: 1 }),
    validateErrorCheck,
    async (req, res) => {
        const memberId = toId(req.params.memberId);
        if (!Number.isInteger(memberId) || memberId <= 0) {
            return res.status(400).send({ success: false, message: 'Invalid member id' });
        }
        const exerciseIds = await replaceContributorAssignments(memberId, req.body.exerciseIds);
        res.status(200).send({ ok: true, exerciseIds });
    },
);

router.put(
    '/exercises/:exerciseId/workflow-assignees/:workflowRole',
    requireSuperAdmin,
    body('adminUserId').optional({ nullable: true }).isInt({ min: 1 }),
    validateErrorCheck,
    async (req, res) => {
        const exerciseId = toId(req.params.exerciseId);
        if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
            return res.status(400).send({ success: false, message: 'Invalid exercise id' });
        }
        const workflowRole = req.params.workflowRole;
        if (workflowRole !== 'proofreader' && workflowRole !== 'second_reviewer') {
            return res.status(400).send({ success: false, message: 'Invalid workflow role' });
        }
        const rawAdminUserId = req.body.adminUserId;
        const adminUserId = rawAdminUserId === null || rawAdminUserId === undefined
            ? null
            : Number(rawAdminUserId);
        const assignedAdminUserId = await updateExerciseWorkflowAssignee({
            exerciseId,
            workflowRole,
            adminUserId,
        });
        res.status(200).send({ ok: true, adminUserId: assignedAdminUserId });
    },
);

router.put(
    '/collaboration/members/:memberId/password',
    requireSuperAdmin,
    validateErrorCheck,
    async (req: any, res) => {
        const memberId = toId(req.params.memberId);
        if (!Number.isInteger(memberId) || memberId <= 0) {
            return res.status(400).send({ success: false, message: 'Invalid member id' });
        }
        const member = await resetAdminMemberPassword({
            memberId,
            actorId: req.admin.id,
        });
        res.status(200).send({ ok: true, member });
    },
);

router.put(
    '/collaboration/members/:memberId/profile',
    requireSuperAdmin,
    body('email').isEmail().normalizeEmail(),
    body('displayName').isString().trim().isLength({ min: 1, max: 120 }),
    body('role').isIn(['super_admin', 'subtitle_contributor']),
    validateErrorCheck,
    async (req, res) => {
        const memberId = toId(req.params.memberId);
        if (!Number.isInteger(memberId) || memberId <= 0) return res.status(400).send({ success: false, message: 'Invalid member id' });
        const member = await updateAdminMemberProfile({ memberId, email: req.body.email, displayName: req.body.displayName, role: req.body.role });
        res.status(200).send({ ok: true, member });
    },
);

router.put(
    '/collaboration/members/:memberId/status',
    requireSuperAdmin,
    body('isActive').isBoolean().toBoolean(),
    validateErrorCheck,
    async (req: any, res) => {
        const memberId = toId(req.params.memberId);
        if (!Number.isInteger(memberId) || memberId <= 0) return res.status(400).send({ success: false, message: 'Invalid member id' });
        const isActive = await setAdminMemberActive({ memberId, actorId: req.admin.id, isActive: req.body.isActive });
        res.status(200).send({ ok: true, isActive });
    },
);

router.post(
    '/collaboration/members/:memberId/sessions/revoke',
    requireSuperAdmin,
    async (req: any, res) => {
        const memberId = toId(req.params.memberId);
        if (!Number.isInteger(memberId) || memberId <= 0) return res.status(400).send({ success: false, message: 'Invalid member id' });
        await revokeAdminMemberSessions({ memberId, actorId: req.admin.id });
        res.status(200).send({ ok: true });
    },
);

router.put(
    '/collaboration/members/:memberId/force-password-change',
    requireSuperAdmin,
    async (req: any, res) => {
        const memberId = toId(req.params.memberId);
        if (!Number.isInteger(memberId) || memberId <= 0) return res.status(400).send({ success: false, message: 'Invalid member id' });
        await forceAdminMemberPasswordChange({ memberId, actorId: req.admin.id });
        res.status(200).send({ ok: true });
    },
);

router.get('/collaboration/preview-volunteers', requireSuperAdmin, async (_req, res) => {
    res.status(200).send({ items: await listPreviewVolunteers() });
});

router.put(
    '/collaboration/preview-volunteers/:userId',
    requireSuperAdmin,
    body('isPreviewVolunteer').isBoolean().toBoolean(),
    validateErrorCheck,
    async (req, res) => {
        const userId = toId(req.params.userId);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).send({ success: false, message: 'Invalid learner user id' });
        }
        await updatePreviewVolunteer(userId, req.body.isPreviewVolunteer);
        res.status(200).send({ ok: true });
    },
);

router.post('/subtitle-drafts/:draftId/approve', async (req: any, res) => {
    const draftId = toId(req.params.draftId);
    if (!Number.isInteger(draftId) || draftId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid subtitle draft id' });
    }
    try {
        const rows = await doRawQuery<{ exercise_id: number | string }>({
            query: 'select exercise_id from exercise_subtitle_drafts where id = ? limit 1',
            params: [draftId],
        });
        if (!rows[0] || !(await canReviewSubtitleDraft(req.admin, Number(rows[0].exercise_id)))) {
            return res.status(403).send({ success: false, message: 'You are not the assigned second reviewer for this course' });
        }
        await approveSubtitleDraft({ draftId, reviewerId: req.admin.id });
        res.status(200).send({ ok: true });
    } catch (error) {
        res.status(409).send({
            success: false,
            message: error instanceof Error ? error.message : '字幕稿审核通过失败',
        });
    }
});

router.post(
    '/subtitle-drafts/:draftId/return',
    body('reviewNote').isString().trim().isLength({ min: 1, max: 4000 }),
    validateErrorCheck,
    async (req: any, res) => {
        const draftId = toId(req.params.draftId);
        if (!Number.isInteger(draftId) || draftId <= 0) {
            return res.status(400).send({ success: false, message: 'Invalid subtitle draft id' });
        }
        try {
            const rows = await doRawQuery<{ exercise_id: number | string }>({
                query: 'select exercise_id from exercise_subtitle_drafts where id = ? limit 1',
                params: [draftId],
            });
            if (!rows[0] || !(await canReviewSubtitleDraft(req.admin, Number(rows[0].exercise_id)))) {
                return res.status(403).send({ success: false, message: 'You are not the assigned second reviewer for this course' });
            }
            await returnSubtitleDraft({
                draftId,
                reviewerId: req.admin.id,
                reviewNote: req.body.reviewNote,
            });
            res.status(200).send({ ok: true });
        } catch (error) {
            res.status(409).send({
                success: false,
                message: error instanceof Error ? error.message : '字幕稿退回失败',
            });
        }
    },
);

export default router;
