import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import { QueryTypes } from 'sequelize';
import type {
    AdminWorkflowActivity,
    AdminWorkflowActivityPage,
    AdminWorkflowActivityType,
    AdminRole,
    AdminReviewTask,
    AdminSubtitleWorkflowTaskInbox,
    AdminWorkflowNotifications,
    AdminWorkflowNotificationType,
    AdminTaskClaimPolicy,
    AdminWorkflowOverview,
    ClaimableWorkflowTaskPage,
    CourseContributionRole,
    CourseWorkflowAssignmentSource,
    CourseWorkflowCredits,
    CreateTranscriptLineRequest,
    SubtitleDraft,
    SubtitleDraftStatus,
    TranscriptLine,
} from '../../domain';
import type { Transaction } from 'sequelize';
import { doRawQuery, doRawUpdate } from '../../models';
import { sequelize } from '../../models/db-config-mysql';
import { AdminUserModel } from '../../models/schema/AdminUserDB';
import { UserModel } from '../../models/schema/UserDB';

export type AdminActor = {
    id: number;
    role: AdminRole;
    mustChangePassword?: boolean;
};

export const normalizeAdminRole = (role: unknown): AdminRole =>
    role === 'subtitle_contributor' ? 'subtitle_contributor' : 'super_admin';

export const isSuperAdmin = (admin: AdminActor | undefined | null) =>
    admin?.role === 'super_admin';

/**
 * 任务领取策略常量。领取期限是滑动窗口：每次保存校对草稿都会把期限顺延到
 * “当前时刻 + CLAIM_WINDOW_HOURS”；这样真正在工作的人不会被自动释放，
 * 只有长期不保存的失联任务才会回到任务池。到期前 12 小时发一次提醒。
 */
export const CLAIM_WINDOW_HOURS = 48;
export const CLAIM_EXPIRING_NOTICE_HOURS = 12;
export const MAX_CONCURRENT_CLAIMS = 3;

type ContributorRow = {
    id: number | string;
    username: string;
    email: string | null;
    display_name: string;
    role: 'subtitle_contributor';
    must_change_password: boolean | number;
    is_active: boolean | number;
    created_at: Date | string | null;
    last_login_at: Date | string | null;
    exercise_id: number | string | null;
};

type AdminMemberRow = Omit<ContributorRow, 'role'> & {
    role: string;
    must_change_password: boolean | number;
    learner_user_id: number | string | null;
    learner_email: string | null;
    learner_display_name: string | null;
};

/** 人员管理需要同时列出超级管理员和字幕贡献者；课程分配仅对后者有效。 */
export async function listAdminMembers() {
    const rows = await doRawQuery<AdminMemberRow>({
        query: `
            select a.id, a.username, a.email, a.display_name, a.role, a.must_change_password,
                   a.is_active, a.created_at, a.last_login_at, a.learner_user_id,
                   learners.email as learner_email, learners.display_name as learner_display_name,
                   assignments.exercise_id
            from admin_users a
            left join users learners on learners.id = a.learner_user_id
            left join exercise_contributor_assignments assignments on assignments.admin_user_id = a.id
            order by field(a.role, 'super_admin', 'admin', 'subtitle_contributor'),
                     a.display_name asc, a.username asc, assignments.exercise_id asc
        `,
    });
    const members = new Map<number, {
        id: number;
        email: string;
        displayName: string;
        role: AdminRole;
        mustChangePassword: boolean;
        isActive: boolean;
        createdAt?: string;
        lastLoginAt?: string;
        assignedExerciseIds: number[];
        learnerUserId?: number;
        learnerEmail?: string;
        learnerDisplayName?: string;
    }>();
    for (const row of rows) {
        const id = Number(row.id);
        const existing = members.get(id) ?? {
            id,
            email: row.email || row.username,
            displayName: row.display_name,
            role: normalizeAdminRole(row.role),
            mustChangePassword: Boolean(row.must_change_password),
            isActive: Boolean(row.is_active),
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
            lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : undefined,
            assignedExerciseIds: [],
            learnerUserId: row.learner_user_id ? Number(row.learner_user_id) : undefined,
            learnerEmail: row.learner_email || undefined,
            learnerDisplayName: row.learner_display_name || undefined,
        };
        if (row.exercise_id && existing.role === 'subtitle_contributor') {
            existing.assignedExerciseIds.push(Number(row.exercise_id));
        }
        members.set(id, existing);
    }
    return [...members.values()];
}

/** 搜索可绑定的学习端账号；已被其他贡献者绑定的账号仍返回，供界面明确提示冲突。 */
export async function listLearnerUsers(search: string) {
    const normalizedSearch = search.trim().slice(0, 120);
    if (!normalizedSearch) return [];
    const rows = await doRawQuery<{
        id: number | string; email: string; display_name: string;
        bound_admin_member_id: number | string | null; bound_admin_display_name: string | null;
    }>({
        query: `select learners.id, learners.email, learners.display_name,
                       bound.id as bound_admin_member_id, bound.display_name as bound_admin_display_name
                from users learners
                left join admin_users bound on bound.learner_user_id = learners.id
                where learners.email like :search or learners.display_name like :search
                order by learners.display_name asc, learners.email asc limit 50`,
        params: { search: `%${normalizedSearch}%` },
    });
    return rows.map((row) => ({
        id: Number(row.id), email: row.email, displayName: row.display_name,
        boundAdminMemberId: row.bound_admin_member_id ? Number(row.bound_admin_member_id) : undefined,
        boundAdminDisplayName: row.bound_admin_display_name || undefined,
    }));
}

/** 绑定关系独立于账号资料与课程授权；只有字幕贡献者可以绑定学习端账号。 */
export async function updateContributorLearnerBinding(memberId: number, learnerUserId: number | null) {
    const member = await AdminUserModel.findOne({ where: { id: memberId, role: 'subtitle_contributor' }, raw: true });
    if (!member) throw new Error('字幕贡献者不存在');
    if (learnerUserId !== null) {
        const learner = await UserModel.findByPk(learnerUserId, { attributes: ['id'], raw: true });
        if (!learner) throw new Error('学习端用户不存在');
        const occupied = await AdminUserModel.findOne({
            where: { learner_user_id: learnerUserId, id: { [Op.ne]: memberId } },
            attributes: ['id'], raw: true,
        });
        if (occupied) throw new Error('该学习端用户已经绑定其他字幕贡献者');
    }
    await AdminUserModel.update({ learner_user_id: learnerUserId }, { where: { id: memberId } });
}

/** 贡献者自助绑定学习端账号：必须用学习端账号凭据重新验证，不能只提交一个用户 ID。 */
export async function bindOwnContributorLearner({
    adminId,
    learnerEmail,
    learnerPassword,
}: {
    adminId: number;
    learnerEmail: string;
    learnerPassword: string;
}) {
    const member = await AdminUserModel.findOne({ where: { id: adminId, role: 'subtitle_contributor' }, raw: true });
    if (!member) throw new Error('仅字幕贡献者可以绑定学习端账号');
    const learner = await UserModel.findOne({ where: { email: learnerEmail.trim().toLowerCase() }, raw: true }) as UserDbLike | null;
    if (!learner || !learner.password_hash || !(await bcrypt.compare(learnerPassword, learner.password_hash))) {
        throw new Error('学习端邮箱或密码不正确');
    }
    const occupied = await AdminUserModel.findOne({
        where: { learner_user_id: Number(learner.id), id: { [Op.ne]: adminId } },
        attributes: ['id'], raw: true,
    });
    if (occupied) throw new Error('该学习端账号已经绑定其他字幕贡献者');
    await AdminUserModel.update({ learner_user_id: Number(learner.id) }, { where: { id: adminId } });
    return { learnerUserId: Number(learner.id), learnerEmail: learner.email, learnerDisplayName: learner.display_name };
}

type UserDbLike = { id: number | string; email: string; display_name: string; password_hash?: string | null };

/** 根据后台课程负责人派生学习端可预览的课程范围。 */
export async function getPreviewExerciseIdsForLearner(userId: number | undefined) {
    if (!userId) return [];
    const rows = await doRawQuery<{ exercise_id: number | string }>({
        query: `select distinct assignees.exercise_id
                from admin_users admins
                inner join exercise_workflow_assignees assignees on assignees.admin_user_id = admins.id
                where admins.learner_user_id = :userId
                  and assignees.workflow_role in ('proofreader', 'second_reviewer')`,
        params: { userId },
    });
    return rows.map((row) => Number(row.exercise_id));
}

const normalizeAssignedExerciseIds = (ids: unknown) =>
    [...new Set(
        (Array.isArray(ids) ? ids : [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
    )];

/**
 * 领取期限的 SQL 表达式：领取时刻之后的 CLAIM_WINDOW_HOURS 小时。
 * 用参数化小时数构造，避免把业务时长硬编码进 SQL 字符串。
 */
const claimExpiryExpression = () => `date_add(utc_timestamp(), interval ${Number(CLAIM_WINDOW_HOURS)} hour)`;

/** 任务池与领取策略；贡献者和超级管理员共用同一份口径。 */
export function getTaskClaimPolicy(): AdminTaskClaimPolicy {
    return {
        claimWindowHours: CLAIM_WINDOW_HOURS,
        maxConcurrentClaims: MAX_CONCURRENT_CLAIMS,
        myActiveClaimCount: 0,
    };
}

/** 当前成员仍在进行中的课程数，含管理员指派与自助领取，用于并发上限校验。 */
async function countActiveProofreadingClaims(adminId: number): Promise<number> {
    const rows = await doRawQuery<{ total: number | string }>({
        query: `select count(*) as total
                from exercise_workflow_assignees assignees
                inner join exercises on exercises.id = assignees.exercise_id
                where assignees.workflow_role = 'proofreader'
                  and assignees.admin_user_id = :adminId
                  and exercises.status in ('draft', 'proofread')
                  and (
                    assignees.claim_expires_at is null
                    or assignees.claim_expires_at > utc_timestamp()
                  )`,
        params: { adminId },
    });
    return Number(rows[0]?.total ?? 0);
}

/**
 * 自助领取是竞争操作：靠 exercise_workflow_assignees 的
 * (exercise_id, workflow_role) 唯一键判定“刚被别人领走”，
 * 不能复用改派时的“先删后插”，否则会互相覆盖。
 */
export async function claimWorkflowTask(exerciseId: number, adminId: number) {
    const contributor = await AdminUserModel.findOne({
        attributes: ['id', 'role'],
        where: { id: adminId, role: 'subtitle_contributor' },
        raw: true,
    });
    if (!contributor) throw new Error('只有字幕贡献者可以领取任务');

    await sequelize.transaction(async (transaction) => {
        const activeCount = Number((await sequelize.query<{ total: number | string }>(
            `select count(*) as total
             from exercise_workflow_assignees assignees
             inner join exercises on exercises.id = assignees.exercise_id
             where assignees.workflow_role = 'proofreader'
               and assignees.admin_user_id = :adminId
               and exercises.status in ('draft', 'proofread')
               and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())`,
            { replacements: { adminId }, type: QueryTypes.SELECT, transaction },
        ))[0]?.total ?? 0);
        if (activeCount >= MAX_CONCURRENT_CLAIMS) {
            throw new Error(`你同时最多只能持有 ${MAX_CONCURRENT_CLAIMS} 门课程，请先完成或放弃现有任务`);
        }

        const [exercise] = await sequelize.query<{ status: string; audio_url: string }>(
            `select status, audio_url from exercises where id = :exerciseId limit 1`,
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        if (!exercise || exercise.status !== 'draft') {
            throw new Error('该课程当前不在可领取的任务池中');
        }
        if (!String(exercise.audio_url ?? '').trim()) {
            throw new Error('该课程媒体尚未就绪，暂不能领取');
        }

        // 唯一键冲突会抛错，表示该课程刚被别人领取，避免重复工作。
        await sequelize.query(
            `insert into exercise_workflow_assignees
               (exercise_id, workflow_role, assignment_source, admin_user_id, claimed_at, claim_expires_at, expiring_notified_at)
             values
               (:exerciseId, 'proofreader', 'self_claimed', :adminId, utc_timestamp(), ${claimExpiryExpression()}, null),
               (:exerciseId, 'second_reviewer', 'self_claimed', :adminId, utc_timestamp(), ${claimExpiryExpression()}, null)`,
            { replacements: { exerciseId, adminId }, transaction },
        );
        await sequelize.query(
            `insert into exercise_contributor_assignments (exercise_id, admin_user_id)
             values (:exerciseId, :adminId)
             on duplicate key update admin_user_id = values(admin_user_id)`,
            { replacements: { exerciseId, adminId }, transaction },
        );
        await recordWorkflowActivity({
            eventType: 'workflow_claimed',
            actorAdminUserId: adminId,
            targetAdminUserId: adminId,
            exerciseId,
            workflowRole: 'proofreader',
        }, transaction);
    });
}

/** 贡献者主动放弃自己领取的任务；已提交二审的课程不可放弃。 */
export async function releaseWorkflowTask(exerciseId: number, adminId: number) {
    await sequelize.transaction(async (transaction) => {
        const [assignee] = await sequelize.query<{ assignment_source: CourseWorkflowAssignmentSource }>(
            `select assignment_source from exercise_workflow_assignees
             where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId limit 1`,
            { replacements: { exerciseId, adminId }, type: QueryTypes.SELECT, transaction },
        );
        if (!assignee) throw new Error('你当前没有持有这门课程');
        if (assignee.assignment_source !== 'self_claimed') {
            throw new Error('管理员指派的任务不能自助放弃');
        }
        const [draft] = await sequelize.query<{ status: SubtitleDraftStatus }>(
            `select status from exercise_subtitle_drafts
             where exercise_id = :exerciseId and admin_user_id = :adminId limit 1`,
            { replacements: { exerciseId, adminId }, type: QueryTypes.SELECT, transaction },
        );
        if (draft?.status === 'submitted') {
            throw new Error('该课程已提交二审，不能放弃，请等待审核结果');
        }
        await sequelize.query(
            `delete from exercise_workflow_assignees
             where exercise_id = :exerciseId and admin_user_id = :adminId
               and workflow_role in ('proofreader', 'second_reviewer')
               and assignment_source = 'self_claimed'`,
            { replacements: { exerciseId, adminId }, transaction },
        );
        await sequelize.query(
            `delete from exercise_contributor_assignments
             where exercise_id = :exerciseId and admin_user_id = :adminId`,
            { replacements: { exerciseId, adminId }, transaction },
        );
        await recordWorkflowActivity({
            eventType: 'workflow_claim_released',
            actorAdminUserId: adminId,
            targetAdminUserId: adminId,
            exerciseId,
            workflowRole: 'proofreader',
        }, transaction);
    });
}

/** 保存校对草稿时顺延滑动期限：真正在干活的人不会被自动释放。 */
export async function renewClaimWindow(exerciseId: number, adminId: number) {
    await sequelize.query(
        `update exercise_workflow_assignees
         set claim_expires_at = ${claimExpiryExpression()},
             expiring_notified_at = null
         where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId`,
        { replacements: { exerciseId, adminId } },
    );
}

/** 提交或审核通过后停止计时；任务不再回到池子里。 */
async function clearClaimDeadline(exerciseId: number, adminId: number, transaction: Transaction) {
    await sequelize.query(
        `update exercise_workflow_assignees
         set claim_expires_at = null, expiring_notified_at = null
         where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId`,
        { replacements: { exerciseId, adminId }, transaction },
    );
}

type ExpiredClaimRow = {
    exercise_id: number | string;
    admin_user_id: number | string;
    draft_status: SubtitleDraftStatus | null;
};

/**
 * 清扫器主逻辑：释放所有已过期的自助领取任务。返回被释放的任务供记录通知与动态。
 * 惰性过期判定在查询/领取侧同时生效，因此即使清扫器短暂停摆也不会把过期锁当真。
 */
export async function expireOverdueSelfClaims(): Promise<ExpiredClaimRow[]> {
    const rows = await sequelize.query<ExpiredClaimRow>(
        `select assignees.exercise_id, assignees.admin_user_id,
                coalesce(drafts.status, 'editing') as draft_status
         from exercise_workflow_assignees assignees
         left join exercise_subtitle_drafts drafts
           on drafts.exercise_id = assignees.exercise_id
          and drafts.admin_user_id = assignees.admin_user_id
         where assignees.workflow_role = 'proofreader'
           and assignees.assignment_source = 'self_claimed'
           and assignees.claim_expires_at is not null
           and assignees.claim_expires_at <= utc_timestamp()
           and coalesce(drafts.status, 'editing') <> 'submitted'`,
        { type: QueryTypes.SELECT },
    );
    for (const row of rows) {
        const exerciseId = Number(row.exercise_id);
        const adminId = Number(row.admin_user_id);
        await sequelize.transaction(async (transaction) => {
            const [, metadata] = await sequelize.query(
                `delete from exercise_workflow_assignees
                 where exercise_id = :exerciseId and admin_user_id = :adminId
                   and workflow_role in ('proofreader', 'second_reviewer')
                   and assignment_source = 'self_claimed'`,
                { replacements: { exerciseId, adminId }, transaction },
            );
            if ((metadata as { affectedRows?: number }).affectedRows === 0) return;
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id = :exerciseId and admin_user_id = :adminId`,
                { replacements: { exerciseId, adminId }, transaction },
            );
            await sequelize.query(
                `insert into admin_workflow_notifications
                   (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
                 values (:adminId, null, :exerciseId, null, 'task_claim_expired')`,
                { replacements: { exerciseId, adminId }, transaction },
            );
            await recordWorkflowActivity({
                eventType: 'workflow_claim_expired',
                actorAdminUserId: null,
                targetAdminUserId: adminId,
                exerciseId,
                workflowRole: 'proofreader',
            }, transaction);
        });
    }
    return rows;
}

/** 给即将到期（12 小时内）的自助领取任务发一次提醒，避免静默丢失工作。 */
export async function notifyExpiringSelfClaims(now: Date) {
    const threshold = new Date(now.getTime() + CLAIM_EXPIRING_NOTICE_HOURS * 60 * 60 * 1000);
    const rows = await doRawQuery<{ exercise_id: number | string; admin_user_id: number | string }>({
        query: `select assignees.exercise_id, assignees.admin_user_id
                from exercise_workflow_assignees assignees
                inner join exercise_subtitle_drafts drafts
                  on drafts.exercise_id = assignees.exercise_id
                 and drafts.admin_user_id = assignees.admin_user_id
                where assignees.workflow_role = 'proofreader'
                  and assignees.assignment_source = 'self_claimed'
                  and assignees.claim_expires_at is not null
                  and assignees.claim_expires_at > utc_timestamp()
                  and assignees.claim_expires_at <= :threshold
                  and assignees.expiring_notified_at is null
                  and drafts.status in ('editing', 'returned')`,
        params: { threshold },
    });
    for (const row of rows) {
        const exerciseId = Number(row.exercise_id);
        const adminId = Number(row.admin_user_id);
        await sequelize.query(
            `update exercise_workflow_assignees
             set expiring_notified_at = utc_timestamp()
             where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId`,
            { replacements: { exerciseId, adminId } },
        );
        await sequelize.query(
            `insert into admin_workflow_notifications
               (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
             values (:adminId, null, :exerciseId, null, 'task_claim_expiring')`,
            { replacements: { exerciseId, adminId } },
        );
    }
}

/**
 * 任务池的可领取课程：草稿状态、媒体就绪、未被禁止领取、且当前没有有效校对负责人。
 * 已过期的自助领取锁视同无主，由“not exists”条件惰性过滤。
 */
export async function listClaimableWorkflowTasks({
    adminId,
    page = 1,
    pageSize = 20,
}: {
    adminId: number;
    page?: number;
    pageSize?: number;
}): Promise<ClaimableWorkflowTaskPage> {
    const resolvedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const resolvedPageSize = Number.isInteger(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 20;
    const offset = (resolvedPage - 1) * resolvedPageSize;
    const [countRows, rows] = await Promise.all([
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total
                    from exercises e
                    inner join categories c on c.id = e.category_id
                    where e.status = 'draft'
                      and e.claim_blocked = false
                      and trim(e.audio_url) <> ''
                      and not exists (
                        select 1 from exercise_workflow_assignees assignees
                        where assignees.exercise_id = e.id
                          and assignees.workflow_role = 'proofreader'
                          and (
                            assignees.claim_expires_at is null
                            or assignees.claim_expires_at > utc_timestamp()
                          )
                      )`,
        }),
        doRawQuery<{
            exercise_id: number | string;
            exercise_title: string;
            category_name: string;
            difficulty: string;
            media_type: string;
            line_count: number | string;
            claim_release_count: number | string;
        }>({
            query: `select e.id as exercise_id, e.title as exercise_title, c.name as category_name,
                           e.difficulty, e.media_type,
                           json_length(coalesce(e.transcript_json, json_array())) as line_count,
                           (
                             select count(*) from admin_workflow_activity_events events
                             where events.exercise_id = e.id
                               and events.event_type in ('workflow_claim_released', 'workflow_claim_expired')
                           ) as claim_release_count
                    from exercises e
                    inner join categories c on c.id = e.category_id
                    where e.status = 'draft'
                      and e.claim_blocked = false
                      and trim(e.audio_url) <> ''
                      and not exists (
                        select 1 from exercise_workflow_assignees assignees
                        where assignees.exercise_id = e.id
                          and assignees.workflow_role = 'proofreader'
                          and (
                            assignees.claim_expires_at is null
                            or assignees.claim_expires_at > utc_timestamp()
                          )
                      )
                    order by e.sort_order asc, e.created_at desc, e.title asc
                    limit :limit offset :offset`,
            params: { limit: resolvedPageSize, offset },
        }),
    ]);
    return {
        items: rows.map((row) => ({
            exerciseId: Number(row.exercise_id),
            exerciseTitle: row.exercise_title,
            categoryName: row.category_name,
            difficulty: row.difficulty as ClaimableWorkflowTaskPage['items'][number]['difficulty'],
            mediaType: row.media_type === 'video' ? 'video' : 'audio',
            lineCount: Number(row.line_count ?? 0),
            claimReleaseCount: Number(row.claim_release_count ?? 0),
        })),
        page: resolvedPage,
        pageSize: resolvedPageSize,
        total: Number(countRows[0]?.total ?? 0),
        policy: {
            claimWindowHours: CLAIM_WINDOW_HOURS,
            maxConcurrentClaims: MAX_CONCURRENT_CLAIMS,
            myActiveClaimCount: await countActiveProofreadingClaims(adminId),
        },
    };
}

/** 超级管理员可对单门课程关闭/开启自助领取，不影响已分配课程的编辑权。 */
export async function updateExerciseClaimAvailability(exerciseId: number, claimBlocked: boolean) {
    const rows = await doRawQuery<{ id: number | string }>({
        query: 'select id from exercises where id = :exerciseId limit 1',
        params: { exerciseId },
    });
    if (!rows[0]) throw new Error('课程不存在');
    await doRawUpdate(
        'update exercises set claim_blocked = :claimBlocked where id = :exerciseId',
        { exerciseId, claimBlocked: claimBlocked ? 1 : 0 },
    );
    return { exerciseId, claimBlocked };
}

/**
 * 超级管理员的任务池概览：谁闲着、谁卡住、池子是否需要补课。
 * “超期未提交”包含管理员指派（只标记不释放）和自助领取（会被清扫器释放）两类。
 */
export async function getWorkflowOverview(): Promise<AdminWorkflowOverview> {
    const now = new Date();
    const hoursBetween = (iso: string) => {
        const at = new Date(iso).getTime();
        return Math.max(0, Math.floor((now.getTime() - at) / (60 * 60 * 1000)));
    };

    const [claimable, unready, blocked, awaiting, overdueRows, statRows] = await Promise.all([
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total
                    from exercises e
                    where e.status = 'draft' and e.claim_blocked = false and trim(e.audio_url) <> ''
                      and not exists (
                        select 1 from exercise_workflow_assignees assignees
                        where assignees.exercise_id = e.id and assignees.workflow_role = 'proofreader'
                          and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())
                      )`,
        }),
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total from exercises
                    where status = 'draft' and (audio_url is null or trim(audio_url) = '')`,
        }),
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total from exercises where status = 'draft' and claim_blocked = true`,
        }),
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total from exercise_subtitle_drafts where status = 'submitted'`,
        }),
        doRawQuery<{
            exercise_id: number | string;
            exercise_title: string;
            contributor_display_name: string;
            assignment_source: CourseWorkflowAssignmentSource;
            draft_status: SubtitleDraftStatus | null;
            claim_expires_at: Date | string;
        }>({
            query: `select assignees.exercise_id, exercises.title as exercise_title,
                           admins.display_name as contributor_display_name,
                           assignees.assignment_source,
                           coalesce(drafts.status, 'editing') as draft_status,
                           assignees.claim_expires_at
                    from exercise_workflow_assignees assignees
                    inner join exercises on exercises.id = assignees.exercise_id
                    inner join admin_users admins on admins.id = assignees.admin_user_id
                    left join exercise_subtitle_drafts drafts
                      on drafts.exercise_id = assignees.exercise_id
                     and drafts.admin_user_id = assignees.admin_user_id
                    where assignees.workflow_role = 'proofreader'
                      and assignees.claim_expires_at is not null
                      and assignees.claim_expires_at <= utc_timestamp()
                      and coalesce(drafts.status, 'editing') <> 'submitted'
                    order by assignees.claim_expires_at asc
                    limit 100`,
        }),
        doRawQuery<{
            admin_user_id: number | string;
            display_name: string;
            active_claim_count: number | string;
            awaiting_review_count: number | string;
            overdue_count: number | string;
            completed_count: number | string;
        }>({
            query: `select admins.id as admin_user_id, admins.display_name,
                           (
                             select count(*) from exercise_workflow_assignees assignees
                             inner join exercises on exercises.id = assignees.exercise_id
                             where assignees.admin_user_id = admins.id
                               and assignees.workflow_role = 'proofreader'
                               and exercises.status in ('draft', 'proofread')
                               and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())
                           ) as active_claim_count,
                           (
                             select count(*) from exercise_subtitle_drafts drafts
                             where drafts.reviewer_admin_user_id = admins.id and drafts.status = 'submitted'
                           ) as awaiting_review_count,
                           (
                             select count(*) from exercise_workflow_assignees assignees
                             left join exercise_subtitle_drafts drafts
                               on drafts.exercise_id = assignees.exercise_id
                              and drafts.admin_user_id = assignees.admin_user_id
                             where assignees.admin_user_id = admins.id
                               and assignees.workflow_role = 'proofreader'
                               and assignees.claim_expires_at is not null
                               and assignees.claim_expires_at <= utc_timestamp()
                               and coalesce(drafts.status, 'editing') <> 'submitted'
                           ) as overdue_count,
                           (
                             select count(*) from exercise_subtitle_drafts drafts
                             where drafts.admin_user_id = admins.id and drafts.status = 'approved'
                           ) as completed_count
                    from admin_users admins
                    where admins.role = 'subtitle_contributor' and admins.is_active = true
                    order by admins.display_name asc`,
        }),
    ]);

    const contributors = statRows.map((row) => {
        const active = Number(row.active_claim_count ?? 0);
        const awaiting = Number(row.awaiting_review_count ?? 0);
        const overdue = Number(row.overdue_count ?? 0);
        const completed = Number(row.completed_count ?? 0);
        return {
            adminUserId: Number(row.admin_user_id),
            displayName: row.display_name,
            activeClaimCount: active,
            awaitingReviewCount: awaiting,
            overdueCount: overdue,
            completedCount: completed,
            // “空闲”定义为：没有进行中的课程，也没有待审核的稿子。
            isIdle: active === 0 && awaiting === 0,
        };
    });

    return {
        generatedAt: now.toISOString(),
        claimableCount: Number(claimable[0]?.total ?? 0),
        unreadyDraftCount: Number(unready[0]?.total ?? 0),
        claimBlockedCount: Number(blocked[0]?.total ?? 0),
        awaitingReviewCount: Number(awaiting[0]?.total ?? 0),
        overdueTasks: overdueRows.map((row) => {
            const expiresIso = new Date(row.claim_expires_at).toISOString();
            return {
                exerciseId: Number(row.exercise_id),
                exerciseTitle: row.exercise_title,
                contributorDisplayName: row.contributor_display_name,
                source: row.assignment_source,
                stage: row.draft_status === 'returned' ? 'returned' : 'proofreading',
                claimExpiresAt: expiresIso,
                overdueHours: hoursBetween(expiresIso),
            };
        }),
        contributors,
        idleContributorCount: contributors.filter((item) => item.isIdle).length,
        policy: {
            claimWindowHours: CLAIM_WINDOW_HOURS,
            maxConcurrentClaims: MAX_CONCURRENT_CLAIMS,
            myActiveClaimCount: 0,
        },
    };
}

async function ensureExerciseIdsExist(exerciseIds: number[]) {
    if (exerciseIds.length === 0) return;
    const rows = await doRawQuery<{ id: number | string }>({
        query: 'select id from exercises where id in (:exerciseIds)',
        params: { exerciseIds },
    });
    if (rows.length !== exerciseIds.length) {
        throw new Error('所选课程中存在已删除或无效的课程');
    }
}

type WorkflowActivityEventInput = {
    eventType: AdminWorkflowActivityType;
    actorAdminUserId?: number | null;
    targetAdminUserId?: number | null;
    exerciseId: number;
    subtitleDraftId?: number | null;
    workflowRole?: CourseContributionRole | null;
    reviewNote?: string | null;
};

/**
 * 协作动态是审计记录而不是可变的任务状态：每个关键动作只插入一行，
 * 与原业务写入共用 transaction，因此不会出现“任务已完成但团队动态缺失”。
 */
async function recordWorkflowActivity(
    event: WorkflowActivityEventInput,
    transaction: Transaction,
) {
    await sequelize.query(
        `insert into admin_workflow_activity_events
           (event_type, actor_admin_user_id, target_admin_user_id, exercise_id,
            subtitle_draft_id, workflow_role, review_note)
         values (:eventType, :actorAdminUserId, :targetAdminUserId, :exerciseId,
                 :subtitleDraftId, :workflowRole, :reviewNote)`,
        {
            replacements: {
                eventType: event.eventType,
                actorAdminUserId: event.actorAdminUserId ?? null,
                targetAdminUserId: event.targetAdminUserId ?? null,
                exerciseId: event.exerciseId,
                subtitleDraftId: event.subtitleDraftId ?? null,
                workflowRole: event.workflowRole ?? null,
                reviewNote: event.reviewNote ?? null,
            },
            transaction,
        },
    );
}

export async function replaceContributorAssignments(
    contributorId: number,
    exerciseIdsInput: unknown,
) {
    const exerciseIds = normalizeAssignedExerciseIds(exerciseIdsInput);
    const contributor = await AdminUserModel.findOne({
        where: { id: contributorId, role: 'subtitle_contributor' },
        raw: true,
    });
    if (!contributor) {
        throw new Error('字幕贡献者不存在');
    }
    await ensureExerciseIdsExist(exerciseIds);
    await sequelize.transaction(async (transaction) => {
        const previousAssignments = await sequelize.query<{ exercise_id: number | string }>(
            `select exercise_id from exercise_contributor_assignments where admin_user_id = :contributorId`,
            { replacements: { contributorId }, type: QueryTypes.SELECT, transaction },
        );
        await sequelize.query(
            'delete from exercise_contributor_assignments where admin_user_id = :contributorId',
            { replacements: { contributorId }, transaction },
        );
        if (exerciseIds.length > 0) {
            await sequelize.query(
                `insert into exercise_contributor_assignments (exercise_id, admin_user_id)
                 values ${exerciseIds.map(() => '(?, ?)').join(', ')}`,
                {
                    replacements: exerciseIds.flatMap((exerciseId) => [exerciseId, contributorId]),
                    transaction,
                },
            );
        }

        // 课程授权与当前简化工作流保持一致：同一位贡献者自动承担校对和二次审核，
        // 这样分配课程后即可直接开始校对，提交时也一定有明确的审核接收人。
        if (exerciseIds.length > 0) {
            // 当前简化模式一门课程只保留一位字幕贡献者；重新分配时替换旧的课程授权。
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id in (:exerciseIds) and admin_user_id <> :contributorId`,
                { replacements: { exerciseIds, contributorId }, transaction },
            );
            await sequelize.query(
                `delete from exercise_workflow_assignees
                 where exercise_id in (:exerciseIds)
                   and workflow_role in ('proofreader', 'second_reviewer')`,
                { replacements: { exerciseIds }, transaction },
            );
            await sequelize.query(
                `insert into exercise_workflow_assignees
                   (exercise_id, workflow_role, assignment_source, admin_user_id, claimed_at, claim_expires_at, expiring_notified_at)
                 values ${exerciseIds.flatMap(() => ["(?, 'proofreader', 'admin_assigned', ?, utc_timestamp(), date_add(utc_timestamp(), interval 48 hour), null)", "(?, 'second_reviewer', 'admin_assigned', ?, utc_timestamp(), date_add(utc_timestamp(), interval 48 hour), null)"]).join(', ')}`,
                {
                    replacements: exerciseIds.flatMap((exerciseId) => [exerciseId, contributorId, exerciseId, contributorId]),
                    transaction,
                },
            );
        }
        const removedExerciseIds = previousAssignments
            .map((row) => Number(row.exercise_id))
            .filter((exerciseId) => !exerciseIds.includes(exerciseId));
        if (removedExerciseIds.length > 0) {
            await sequelize.query(
                `delete from exercise_workflow_assignees
                 where exercise_id in (:removedExerciseIds)
                   and admin_user_id = :contributorId
                   and workflow_role in ('proofreader', 'second_reviewer')`,
                { replacements: { removedExerciseIds, contributorId }, transaction },
            );
        }
    });
    return exerciseIds;
}

/** 从课程维度维护授权，供课程列表中的贡献者下拉框直接调用。 */
/**
 * 为课程指定唯一字幕贡献者。当前简化流程中，该成员同时承担校对和二次审核；
 * 超级管理员只负责配置，不会被误写入贡献者工作流。
 */
export async function updateExerciseWorkflowAssignee({
    exerciseId,
    workflowRole,
    adminUserId,
    actorAdminUserId,
}: {
    exerciseId: number;
    workflowRole: CourseContributionRole;
    adminUserId: number | null;
    actorAdminUserId: number;
}) {
    if (workflowRole !== 'proofreader' && workflowRole !== 'second_reviewer') {
        throw new Error('无效的工作流步骤');
    }
    await ensureExerciseIdsExist([exerciseId]);
    if (adminUserId !== null) {
        const contributor = await AdminUserModel.findOne({
            attributes: ['id'],
            where: { id: adminUserId, role: 'subtitle_contributor' },
            raw: true,
        });
        if (!contributor) {
            throw new Error('所选人员不是有效的字幕贡献者');
        }
    }

    await sequelize.transaction(async (transaction) => {
        const existingAssignees = await sequelize.query<{
            workflow_role: CourseContributionRole;
            admin_user_id: number | string;
        }>(
            `select workflow_role, admin_user_id
             from exercise_workflow_assignees
             where exercise_id = :exerciseId and workflow_role in ('proofreader', 'second_reviewer')`,
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        const previousProofreaderId = Number(existingAssignees.find((row) => row.workflow_role === 'proofreader')?.admin_user_id ?? 0);
        const previousReviewerId = Number(existingAssignees.find((row) => row.workflow_role === 'second_reviewer')?.admin_user_id ?? 0);
        const previousAssigneeId = previousProofreaderId || previousReviewerId;
        // 当前流程由同一位贡献者负责校对和二审；从任一步骤选择人员时同步更新两步。
        await sequelize.query(
            `delete from exercise_workflow_assignees
             where exercise_id = :exerciseId and workflow_role in ('proofreader', 'second_reviewer')`,
            { replacements: { exerciseId }, transaction },
        );
        if (adminUserId !== null) {
            await sequelize.query(
                `insert into exercise_workflow_assignees
                   (exercise_id, workflow_role, assignment_source, admin_user_id, claimed_at, claim_expires_at, expiring_notified_at)
                 values (:exerciseId, 'proofreader', 'admin_assigned', :adminUserId, utc_timestamp(), ${claimExpiryExpression()}, null),
                        (:exerciseId, 'second_reviewer', 'admin_assigned', :adminUserId, utc_timestamp(), ${claimExpiryExpression()}, null)`,
                { replacements: { exerciseId, adminUserId }, transaction },
            );
            // 补齐旧流程遗留的“未分配待审稿”，让它们进入这位贡献者的队列。
            await sequelize.query(
                `insert into admin_workflow_notifications
                   (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
                 select :adminUserId, drafts.admin_user_id, drafts.exercise_id, drafts.id, 'subtitle_submitted'
                 from exercise_subtitle_drafts drafts
                 where drafts.exercise_id = :exerciseId
                   and drafts.status = 'submitted'
                   and drafts.reviewer_admin_user_id is null`,
                { replacements: { exerciseId, adminUserId }, transaction },
            );
            await sequelize.query(
                `update exercise_subtitle_drafts
                 set reviewer_admin_user_id = :adminUserId
                 where exercise_id = :exerciseId
                   and status = 'submitted'
                   and reviewer_admin_user_id is null`,
                { replacements: { exerciseId, adminUserId }, transaction },
            );
            // 课程编辑权限由“课程分配”派生，工作流负责人配置也要保留该兼容授权。
            await sequelize.query(
                `insert into exercise_contributor_assignments (exercise_id, admin_user_id)
                 values (:exerciseId, :adminUserId)
                 on duplicate key update admin_user_id = values(admin_user_id)`,
                { replacements: { exerciseId, adminUserId }, transaction },
            );
        }
        if (adminUserId === null && previousAssigneeId > 0) {
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id = :exerciseId and admin_user_id in (:adminUserIds)`,
                { replacements: { exerciseId, adminUserIds: [...new Set([previousProofreaderId, previousReviewerId].filter((id) => id > 0))] }, transaction },
            );
        } else if (adminUserId !== previousProofreaderId && previousProofreaderId > 0 && previousProofreaderId !== previousReviewerId) {
            // 校对负责人拥有的编辑权限由该负责人派生；取消或改派后清理旧权限。
            // 若同一人仍担任二审负责人，则保留其课程访问权，确保审核任务不中断。
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id = :exerciseId and admin_user_id = :previousProofreaderId`,
                { replacements: { exerciseId, previousProofreaderId }, transaction },
            );
        }
        if (previousAssigneeId !== (adminUserId ?? 0)) {
            if (previousAssigneeId > 0) {
                await recordWorkflowActivity({
                    eventType: 'workflow_unassigned',
                    actorAdminUserId,
                    targetAdminUserId: previousAssigneeId,
                    exerciseId,
                    workflowRole,
                }, transaction);
            }
            if (adminUserId !== null) {
                await recordWorkflowActivity({
                    eventType: 'workflow_assigned',
                    actorAdminUserId,
                    targetAdminUserId: adminUserId,
                    exerciseId,
                    workflowRole,
                }, transaction);
            }
        }
    });
    return adminUserId;
}

/** 创建后台成员时系统生成临时密码，首次登录必须主动改密。 */
const createTemporaryPassword = () => {
    // 使用 URL-safe 随机值并带前缀，避开易混淆字符；明文仅用于本次接口响应。
    return `Dt-${randomBytes(12).toString('base64url')}`;
};

export async function createAdminMember({
    email,
    displayName,
    role,
}: {
    email: string;
    displayName: string;
    role: unknown;
}) {
    const normalizedRole: AdminRole = role === 'subtitle_contributor'
        ? 'subtitle_contributor'
        : role === 'super_admin'
            ? 'super_admin'
            : (() => { throw new Error('无效的后台角色'); })();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedDisplayName = displayName.trim();
    if (!normalizedEmail || !normalizedDisplayName) {
        throw new Error('请填写邮箱和成员名称');
    }
    const existing = await AdminUserModel.findOne({
        where: { [Op.or]: [{ email: normalizedEmail }, { username: normalizedEmail }] },
    });
    if (existing) {
        throw new Error('该后台登录邮箱已被使用');
    }
    const temporaryPassword = createTemporaryPassword();
    const member = await AdminUserModel.create({
        // username 是兼容旧表结构的历史字段；新成员以同一个邮箱值写入它，不对界面暴露。
        username: normalizedEmail,
        email: normalizedEmail,
        display_name: normalizedDisplayName,
        password_hash: await bcrypt.hash(temporaryPassword, 10),
        role: normalizedRole,
        must_change_password: true,
        is_active: true,
    } as any);
    return {
        id: Number(member.id),
        email: normalizedEmail,
        displayName: normalizedDisplayName,
        role: normalizedRole,
        temporaryPassword,
    };
}

/** 重设密码会立即撤销该成员原有会话，并再次要求以新临时密码改密。 */
export async function resetAdminMemberPassword({
    memberId,
    actorId,
}: {
    memberId: number;
    actorId: number;
}) {
    if (memberId === actorId) {
        throw new Error('请在账号菜单中修改自己的密码，不能在此重设自己的密码');
    }
    const member = await AdminUserModel.findByPk(memberId);
    if (!member) {
        throw new Error('后台成员不存在');
    }
    const temporaryPassword = createTemporaryPassword();
    await AdminUserModel.update(
        {
            password_hash: await bcrypt.hash(temporaryPassword, 10),
            must_change_password: true,
            token: null,
            token_expires_at: null,
        },
        { where: { id: memberId } },
    );
    const row = member.get({ plain: true });
    return {
        id: Number(row.id),
        email: row.email || row.username,
        displayName: row.display_name,
        role: normalizeAdminRole(row.role),
        temporaryPassword,
    };
}

/** 修改账号资料，与课程授权保持独立。 */
export async function updateAdminMemberProfile({ memberId, actorId, email, displayName, role }: {
    memberId: number;
    actorId: number;
    email: string;
    displayName: string;
    role: AdminRole;
}) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedDisplayName = displayName.trim();
    if (!normalizedEmail || !normalizedDisplayName) throw new Error('请填写邮箱和成员名称');
    const member = await AdminUserModel.findByPk(memberId);
    if (!member) throw new Error('后台成员不存在');
    if (memberId === actorId && role !== 'super_admin') {
        throw new Error('不能降低当前登录账号的超级管理员权限');
    }
    if (member.role === 'super_admin' && role !== 'super_admin') {
        const activeSuperAdminCount = await AdminUserModel.count({ where: { role: 'super_admin', is_active: true } });
        if (activeSuperAdminCount <= 1) throw new Error('至少需要保留一名正常状态的超级管理员');
    }
    const duplicate = await AdminUserModel.findOne({
        where: { [Op.or]: [{ email: normalizedEmail }, { username: normalizedEmail }] },
    });
    if (duplicate && Number(duplicate.id) !== memberId) throw new Error('该后台登录邮箱已被使用');
    await AdminUserModel.update(
        {
            email: normalizedEmail,
            username: normalizedEmail,
            display_name: normalizedDisplayName,
            role,
            // 资料或角色变更后要求重新登录，避免旧会话继续使用过期权限。
            token: null,
            token_expires_at: null,
        },
        { where: { id: memberId } },
    );
    return { id: memberId, email: normalizedEmail, displayName: normalizedDisplayName, role };
}

/** 停用会立即撤销会话；不能停用当前操作者。 */
export async function setAdminMemberActive({ memberId, actorId, isActive }: { memberId: number; actorId: number; isActive: boolean }) {
    if (memberId === actorId) throw new Error('不能停用当前登录账号');
    const member = await AdminUserModel.findByPk(memberId);
    if (!member) throw new Error('后台成员不存在');
    if (!isActive && member.role === 'super_admin') {
        const activeSuperAdminCount = await AdminUserModel.count({ where: { role: 'super_admin', is_active: true } });
        if (activeSuperAdminCount <= 1) throw new Error('至少需要保留一名正常状态的超级管理员');
    }
    await AdminUserModel.update(
        isActive ? { is_active: true } : { is_active: false, token: null, token_expires_at: null },
        { where: { id: memberId } },
    );
    return isActive;
}

/** 撤销全部会话但不改变账号状态。 */
export async function revokeAdminMemberSessions({ memberId, actorId }: { memberId: number; actorId: number }) {
    if (memberId === actorId) throw new Error('请使用退出登录来撤销当前账号会话');
    const member = await AdminUserModel.findByPk(memberId);
    if (!member) throw new Error('后台成员不存在');
    await AdminUserModel.update({ token: null, token_expires_at: null }, { where: { id: memberId } });
}

/** 强制成员下次登录先修改密码，同时撤销现有会话。 */
export async function forceAdminMemberPasswordChange({ memberId, actorId }: { memberId: number; actorId: number }) {
    if (memberId === actorId) throw new Error('请通过账号菜单修改自己的密码');
    const member = await AdminUserModel.findByPk(memberId);
    if (!member) throw new Error('后台成员不存在');
    await AdminUserModel.update(
        { must_change_password: true, token: null, token_expires_at: null },
        { where: { id: memberId } },
    );
}

/** 超级管理员可为字幕贡献者解除公开署名的 90 天改名冷却，不影响登录会话或历史署名。 */
export async function resetContributorDisplayNameCooldown(memberId: number) {
    const member = await AdminUserModel.findOne({
        where: { id: memberId, role: 'subtitle_contributor' },
        attributes: ['id'],
        raw: true,
    });
    if (!member) throw new Error('字幕贡献者不存在');
    await AdminUserModel.update(
        { last_display_name_changed_at: null },
        { where: { id: memberId } },
    );
}

export async function getAssignedExerciseIds(adminId: number) {
    const rows = await doRawQuery<{ exercise_id: number | string }>({
        // 校对人与二审人都需要在“课程管理”中看见任务；待审核稿保留提交时的审核人快照，
        // 因此重新分配负责人后，原审核人仍能完成已经交到自己手里的任务。
        // 已过期的自助领取锁视同释放，不再出现在课程管理列表中。
        query: `select exercise_id from exercise_contributor_assignments where admin_user_id = ?
                union
                select exercise_id from exercise_workflow_assignees where admin_user_id = ?
                  and (
                    assignment_source = 'admin_assigned'
                    or claim_expires_at is null
                    or claim_expires_at > utc_timestamp()
                  )
                union
                select exercise_id from exercise_subtitle_drafts
                where reviewer_admin_user_id = ? and status = 'submitted'`,
        params: [adminId, adminId, adminId],
    });
    return rows.map((row) => Number(row.exercise_id));
}

export async function canEditExerciseSubtitles(admin: AdminActor, exerciseId: number) {
    if (isSuperAdmin(admin)) return true;
    const rows = await doRawQuery<{ id: number | string }>({
        query: `select assignments.id
                from exercise_contributor_assignments assignments
                left join exercise_subtitle_drafts drafts
                  on drafts.exercise_id = assignments.exercise_id and drafts.admin_user_id = assignments.admin_user_id
                where assignments.admin_user_id = ? and assignments.exercise_id = ?
                  and (drafts.id is null or drafts.status in ('editing', 'returned'))
                  and (
                    exists (
                      select 1 from exercise_workflow_assignees workflow
                      where workflow.exercise_id = assignments.exercise_id
                        and workflow.workflow_role = 'proofreader'
                        and workflow.admin_user_id = assignments.admin_user_id
                    )
                    or not exists (
                      select 1 from exercise_workflow_assignees workflow
                      where workflow.exercise_id = assignments.exercise_id
                        and workflow.workflow_role = 'proofreader'
                    )
                  )
                limit 1`,
        params: [admin.id, exerciseId],
    });
    return rows.length > 0;
}

async function isWorkflowAssignee(
    exerciseId: number,
    adminId: number,
    workflowRole: CourseContributionRole,
) {
    const rows = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_workflow_assignees
                where exercise_id = ? and admin_user_id = ? and workflow_role = ?
                  and (
                    assignment_source = 'admin_assigned'
                    or claim_expires_at is null
                    or claim_expires_at > utc_timestamp()
                  )
                limit 1`,
        params: [exerciseId, adminId, workflowRole],
    });
    return rows.length > 0;
}

/** 课程详情对两种负责人均可见；但只有校对负责人可修改并提交字幕。 */
export async function canAccessExerciseWorkflow(admin: AdminActor, exerciseId: number) {
    if (isSuperAdmin(admin)) return true;
    if (await canEditExerciseSubtitles(admin, exerciseId)) return true;
    if (await isWorkflowAssignee(exerciseId, admin.id, 'second_reviewer')) return true;
    const reviewTasks = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_subtitle_drafts
                where exercise_id = ? and reviewer_admin_user_id = ? and status = 'submitted' limit 1`,
        params: [exerciseId, admin.id],
    });
    return reviewTasks.length > 0;
}

/**
 * 仅课程指定的校对负责人可提交，避免把“可编辑”误当成“可提交二审”。
 * 尚未采用负责人机制的旧课程，保留原先“被授权即可提交”的兼容行为。
 */
export async function canSubmitSubtitleDraft(admin: AdminActor, exerciseId: number) {
    // 超级管理员只负责配置负责人与维护正式内容，不参与协作流程，更不能提交校对稿。
    if (isSuperAdmin(admin)) return false;
    const proofreaderIsAssigned = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_workflow_assignees
                where exercise_id = ? and workflow_role = 'proofreader' limit 1`,
        params: [exerciseId],
    });
    return proofreaderIsAssigned.length > 0
        ? isWorkflowAssignee(exerciseId, admin.id, 'proofreader')
        : canEditExerciseSubtitles(admin, exerciseId);
}

/**
 * 提交时必须同时冻结校对和审核职责。审核负责人不是可选提示：没有明确接收人就
 * 不允许把字幕稿送出，避免出现无人可处理的待审稿。
 */
async function getWorkflowSubmissionAssignees(exerciseId: number) {
    const rows = await doRawQuery<{
        workflow_role: CourseContributionRole;
        admin_user_id: number | string;
    }>({
        query: `select workflow_role, admin_user_id from exercise_workflow_assignees
                where exercise_id = ? and workflow_role in ('proofreader', 'second_reviewer')`,
        params: [exerciseId],
    });
    const proofreaderId = rows.find((row) => row.workflow_role === 'proofreader')?.admin_user_id;
    const reviewerId = rows.find((row) => row.workflow_role === 'second_reviewer')?.admin_user_id;
    if (!proofreaderId || !reviewerId) {
        throw new Error('请先为本课程同时指定校对和审核人员，才能提交审核');
    }
    return { proofreaderId: Number(proofreaderId), reviewerId: Number(reviewerId) };
}

/** 二次审核也由贡献者承担，必须由本课已配置的二审负责人完成。 */
export async function canReviewSubtitleDraft(admin: AdminActor, exerciseId: number) {
    if (await isWorkflowAssignee(exerciseId, admin.id, 'second_reviewer')) return true;
    const snapshotTasks = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_subtitle_drafts
                where exercise_id = ? and reviewer_admin_user_id = ? and status = 'submitted' limit 1`,
        params: [exerciseId, admin.id],
    });
    return snapshotTasks.length > 0;
}

type SubtitleDraftRow = {
    id: number | string;
    exercise_id: number | string;
    admin_user_id: number | string;
    reviewer_admin_user_id?: number | string | null;
    display_name: string;
    transcript_json: unknown;
    status: SubtitleDraftStatus;
    review_note: string | null;
    submitted_at: Date | string | null;
    updated_at: Date | string | null;
};

type WorkflowNotificationRow = {
    id: number | string;
    notification_type: AdminWorkflowNotificationType;
    exercise_id: number | string;
    exercise_title: string;
    actor_display_name: string | null;
    review_note: string | null;
    is_read: boolean | number;
    created_at: Date | string;
};

// Keep the draft format identical to exercises.transcript_json.  This makes a
// reviewed draft safe to promote atomically without lossy client conversion.
const parseSubtitleDraftLines = (value: unknown): TranscriptLine[] => {
    if (Array.isArray(value)) return value as TranscriptLine[];
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed as TranscriptLine[] : [];
    } catch {
        return [];
    }
};

const toSubtitleDraft = (row: SubtitleDraftRow): SubtitleDraft => ({
    id: Number(row.id),
    exerciseId: Number(row.exercise_id),
    contributorDisplayName: row.display_name,
    status: row.status,
    lines: parseSubtitleDraftLines(row.transcript_json),
    reviewNote: row.review_note || undefined,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
});

/** 贡献者只能读取自己的草稿；超级管理员只读取待二次审核的投稿。 */
export async function listExerciseSubtitleDrafts(
    exerciseId: number,
    admin: AdminActor,
    options?: { submittedOnly?: boolean },
) {
    // 管理员可以查看待审稿来安排工作；通过/退回的权限仍由路由层严格校验负责人。
    const reviewerCanSeeSubmitted = isSuperAdmin(admin)
        || await canReviewSubtitleDraft(admin, exerciseId);
    // 贡献者可能同时是本课的校对人和二审人（自助领取就是这种情况）。
    // 因此不能因为具备二审权限就只查询 submitted：否则自己的 editing/returned
    // 工作稿会被过滤掉，前端随后会错误回退到课程主字幕基线。
    const scope = isSuperAdmin(admin)
        ? `and drafts.status = 'submitted'`
        : options?.submittedOnly
            ? `and drafts.status = 'submitted' and drafts.reviewer_admin_user_id = :adminId`
            : reviewerCanSeeSubmitted
                ? `and (
                     drafts.admin_user_id = :adminId
                     or (drafts.status = 'submitted' and drafts.reviewer_admin_user_id = :adminId)
                   )`
                : `and drafts.admin_user_id = :adminId`;
    const rows = await doRawQuery<SubtitleDraftRow>({
        query: `
            select drafts.id, drafts.exercise_id, drafts.admin_user_id, admins.display_name,
                   drafts.transcript_json, drafts.status, drafts.review_note,
                   drafts.submitted_at, drafts.updated_at
            from exercise_subtitle_drafts drafts
            inner join admin_users admins on admins.id = drafts.admin_user_id
            where drafts.exercise_id = :exerciseId ${scope}
            order by drafts.submitted_at desc, drafts.updated_at desc
        `,
        params: { exerciseId, adminId: admin.id },
    });
    return rows.map(toSubtitleDraft);
}

/** 学习端负责人可读取自己课程的最新工作稿，普通学习者永远不可见。 */
export async function getPreviewSubtitleDraftForLearner(exerciseId: number, learnerUserId: number | undefined) {
    if (!learnerUserId) return undefined;
    const rows = await doRawQuery<SubtitleDraftRow>({
        query: `
            select drafts.id, drafts.exercise_id, drafts.admin_user_id, admins.display_name,
                   drafts.transcript_json, drafts.status, drafts.review_note,
                   drafts.submitted_at, drafts.updated_at
            from exercise_subtitle_drafts drafts
            inner join admin_users admins on admins.id = drafts.admin_user_id
            inner join exercise_workflow_assignees assignees
              on assignees.exercise_id = drafts.exercise_id
             and assignees.admin_user_id = admins.id
             and assignees.workflow_role in ('proofreader', 'second_reviewer')
            where drafts.exercise_id = :exerciseId
              and admins.learner_user_id = :learnerUserId
              and drafts.status in ('editing', 'submitted', 'returned')
            order by drafts.updated_at desc
            limit 1
        `,
        params: { exerciseId, learnerUserId },
    });
    return rows[0] ? toSubtitleDraft(rows[0]) : undefined;
}

/** 兼容后台/旧调用：仅保留已提交稿查询，不用于学习端授权。 */
export async function getLatestSubmittedSubtitleDraft(exerciseId: number) {
    const rows = await doRawQuery<SubtitleDraftRow>({
        query: `select drafts.id, drafts.exercise_id, drafts.admin_user_id, admins.display_name,
                       drafts.transcript_json, drafts.status, drafts.review_note,
                       drafts.submitted_at, drafts.updated_at
                from exercise_subtitle_drafts drafts
                inner join admin_users admins on admins.id = drafts.admin_user_id
                where drafts.exercise_id = :exerciseId and drafts.status = 'submitted'
                order by drafts.submitted_at desc, drafts.updated_at desc limit 1`,
        params: { exerciseId },
    });
    return rows[0] ? toSubtitleDraft(rows[0]) : undefined;
}

/** 保存仅更新个人工作稿；不能改变课程主字幕或发布状态。 */
export async function saveSubtitleDraft({
    exerciseId,
    adminId,
    lines,
}: {
    exerciseId: number;
    adminId: number;
    lines: CreateTranscriptLineRequest[];
}) {
    const existing = await doRawQuery<{ status: SubtitleDraftStatus }>({
        query: `select status from exercise_subtitle_drafts
                where exercise_id = :exerciseId and admin_user_id = :adminId limit 1`,
        params: { exerciseId, adminId },
    });
    if (existing[0]?.status === 'submitted') {
        throw new Error('该字幕稿已提交审核，请等待审核结果或被退回后再修改');
    }
    if (existing[0]?.status === 'approved') {
        throw new Error('该字幕稿已审核通过并发布，不能再次修改或提交');
    }
    await sequelize.query(
        `insert into exercise_subtitle_drafts
           (exercise_id, admin_user_id, transcript_json, status, review_note, submitted_at, reviewed_at, reviewed_by_admin_user_id)
         values (:exerciseId, :adminId, cast(:transcriptJson as json), 'editing', null, null, null, null)
         on duplicate key update
           transcript_json = values(transcript_json),
           status = 'editing',
           submitted_at = null,
           reviewed_at = null,
           reviewed_by_admin_user_id = null,
           updated_at = current_timestamp`,
        {
            replacements: {
                exerciseId,
                adminId,
                transcriptJson: JSON.stringify(lines),
            },
        },
    );
    // 滑动窗口：保存即续期，只有停止保存 48 小时以上的任务才会被释放。
    await renewClaimWindow(exerciseId, adminId);
}

/** 提交将同一份工作稿锁定为待审核版本；再次修改必须先被管理员退回。 */
export async function submitSubtitleDraft({
    exerciseId,
    adminId,
    lines,
}: {
    exerciseId: number;
    adminId: number;
    lines: CreateTranscriptLineRequest[];
}) {
    const existing = await doRawQuery<{ status: SubtitleDraftStatus }>({
        query: `select status from exercise_subtitle_drafts
                where exercise_id = :exerciseId and admin_user_id = :adminId limit 1`,
        params: { exerciseId, adminId },
    });
    if (existing[0]?.status === 'submitted') {
        throw new Error('该字幕稿已在审核队列中，不能重复提交');
    }
    if (existing[0]?.status === 'approved') {
        throw new Error('该字幕稿已审核通过并发布，不能重复提交');
    }
    await sequelize.transaction(async (transaction) => {
        const assignees = await getWorkflowSubmissionAssignees(exerciseId);
        if (assignees.proofreaderId !== adminId) {
            throw new Error('只有本课程指定的校对人员可以提交审核');
        }
        const [exercise] = await sequelize.query<{ status: string }>(
            'select status from exercises where id = :exerciseId limit 1',
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        if (!exercise) throw new Error('课程不存在');
        await sequelize.query(
            `insert into exercise_subtitle_drafts
           (exercise_id, admin_user_id, reviewer_admin_user_id, transcript_json, status, review_note, submitted_at, reviewed_at, reviewed_by_admin_user_id)
         values (:exerciseId, :adminId, :reviewerId, cast(:transcriptJson as json), 'submitted', null, current_timestamp, null, null)
         on duplicate key update
           transcript_json = values(transcript_json),
           reviewer_admin_user_id = values(reviewer_admin_user_id),
           status = 'submitted',
           review_note = null,
           submitted_at = current_timestamp,
           reviewed_at = null,
           reviewed_by_admin_user_id = null,
           updated_at = current_timestamp`,
            {
                replacements: {
                    exerciseId,
                    adminId,
                    reviewerId: assignees.reviewerId,
                    transcriptJson: JSON.stringify(lines),
                },
                transaction,
            },
        );
        // 首次制课从草稿进入待审核；已发布课程有新投稿时保持发布，
        // 让普通学习者继续使用稳定的正式版本。
        if (exercise.status === 'draft') {
            await sequelize.query(
                `update exercises set status = 'proofread', updated_at = current_timestamp
                 where id = :exerciseId`,
                { replacements: { exerciseId }, transaction },
            );
        }
        // 提交后停止计时：任务进入二审，不再回到任务池。
        await clearClaimDeadline(exerciseId, adminId, transaction);
        // 使用投稿行的确定 ID 创建通知，确保一份投稿只给其提交时的审核人一条待办。
        await sequelize.query(
            `insert into admin_workflow_notifications
               (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
             select :reviewerId, :adminId, :exerciseId, id, 'subtitle_submitted'
             from exercise_subtitle_drafts
             where exercise_id = :exerciseId and admin_user_id = :adminId`,
            {
                replacements: { exerciseId, adminId, reviewerId: assignees.reviewerId },
                transaction,
            },
        );
        const [draft] = await sequelize.query<{ id: number | string }>(
            `select id from exercise_subtitle_drafts
             where exercise_id = :exerciseId and admin_user_id = :adminId limit 1`,
            { replacements: { exerciseId, adminId }, type: QueryTypes.SELECT, transaction },
        );
        if (!draft) {
            throw new Error('字幕稿保存后无法读取');
        }
        await recordWorkflowActivity({
            eventType: 'subtitle_submitted',
            actorAdminUserId: adminId,
            targetAdminUserId: assignees.reviewerId,
            exerciseId,
            subtitleDraftId: Number(draft.id),
            workflowRole: 'proofreader',
        }, transaction);
    });
}

export async function returnSubtitleDraft({
    draftId,
    reviewerId,
    reviewNote,
}: {
    draftId: number;
    reviewerId: number;
    reviewNote: string;
}) {
    await sequelize.transaction(async (transaction) => {
        const rows = await sequelize.query<{
            exercise_id: number | string;
            admin_user_id: number | string;
            reviewer_admin_user_id: number | string | null;
        }>(
            `select exercise_id, admin_user_id, reviewer_admin_user_id
             from exercise_subtitle_drafts where id = :draftId and status = 'submitted' limit 1`,
            { replacements: { draftId }, type: QueryTypes.SELECT, transaction },
        );
        const draft = rows[0];
        if (!draft || Number(draft.reviewer_admin_user_id) !== reviewerId) {
            throw new Error('这份字幕稿已不在你的待审核队列中');
        }
        const [, metadata] = await sequelize.query(
            `update exercise_subtitle_drafts
             set status = 'returned', review_note = :reviewNote, reviewed_at = current_timestamp,
                 reviewed_by_admin_user_id = :reviewerId
             where id = :draftId and status = 'submitted'`,
            { replacements: { draftId, reviewerId, reviewNote }, transaction },
        );
        if ((metadata as { affectedRows?: number }).affectedRows === 0) {
            throw new Error('这份字幕稿已不在待审核队列中');
        }

        await sequelize.query(
            `insert into admin_workflow_notifications
               (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type, review_note)
             values (:recipientId, :reviewerId, :exerciseId, :draftId, 'subtitle_returned', :reviewNote)`,
            {
                replacements: {
                    recipientId: Number(draft.admin_user_id), reviewerId,
                    exerciseId: Number(draft.exercise_id), draftId, reviewNote,
                },
                transaction,
            },
        );
        await recordWorkflowActivity({
            eventType: 'subtitle_returned',
            actorAdminUserId: reviewerId,
            targetAdminUserId: Number(draft.admin_user_id),
            exerciseId: Number(draft.exercise_id),
            subtitleDraftId: draftId,
            workflowRole: 'second_reviewer',
            reviewNote,
        }, transaction);

        // 退回后重新开始校对计时：给投稿人一个新的 48 小时滑动窗口。
        await sequelize.query(
            `update exercise_workflow_assignees
             set claim_expires_at = ${claimExpiryExpression()}, expiring_notified_at = null
             where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId`,
            { replacements: { exerciseId: Number(draft.exercise_id), adminId: Number(draft.admin_user_id) }, transaction },
        );

        // 初次制课若所有投稿都退回，课程回到草稿；已发布课程则始终保留发布状态。
        await sequelize.query(
            `update exercises course
             set course.status = 'draft', course.updated_at = current_timestamp
             where course.status = 'proofread'
               and course.id = (
                 select draft.exercise_id from exercise_subtitle_drafts draft where draft.id = :draftId
               )
               and not exists (
                 select 1 from exercise_subtitle_drafts remaining
                 where remaining.exercise_id = course.id and remaining.status = 'submitted'
               )`,
            { replacements: { draftId }, transaction },
        );
    });
}

/** 仅在二次审核通过时替换课程正式字幕，保持事务内状态和署名同步。 */
export async function approveSubtitleDraft({
    draftId,
    reviewerId,
}: {
    draftId: number;
    reviewerId: number;
}) {
    await sequelize.transaction(async (transaction) => {
        const rows = await sequelize.query<SubtitleDraftRow>(
            `select drafts.id, drafts.exercise_id, drafts.admin_user_id, drafts.reviewer_admin_user_id, admins.display_name,
                    drafts.transcript_json, drafts.status, drafts.review_note,
                    drafts.submitted_at, drafts.updated_at
             from exercise_subtitle_drafts drafts
             inner join admin_users admins on admins.id = drafts.admin_user_id
             where drafts.id = :draftId and drafts.status = 'submitted'
             limit 1`,
            { replacements: { draftId }, type: QueryTypes.SELECT, transaction },
        );
        const draft = rows[0];
        if (!draft) throw new Error('这份字幕稿已不在待审核队列中');
        if (Number(draft.reviewer_admin_user_id) !== reviewerId) {
            throw new Error('这份字幕稿已不在你的待审核队列中');
        }

        const [exerciseRows] = await sequelize.query<{ id: number | string }>(
            'select id from exercises where id = :exerciseId limit 1',
            { replacements: { exerciseId: Number(draft.exercise_id) }, type: QueryTypes.SELECT, transaction },
        );
        if (!exerciseRows) throw new Error('课程不存在');

        await sequelize.query(
            `update exercises
             set transcript_json = cast(:transcriptJson as json), status = 'published', updated_at = current_timestamp
             where id = :exerciseId`,
            {
                replacements: {
                    exerciseId: Number(draft.exercise_id),
                    transcriptJson: JSON.stringify(parseSubtitleDraftLines(draft.transcript_json)),
                },
                transaction,
            },
        );
        await sequelize.query(
            `update exercise_subtitle_drafts
             set status = 'approved', review_note = null, reviewed_at = current_timestamp,
                 reviewed_by_admin_user_id = :reviewerId
             where id = :draftId`,
            { replacements: { draftId, reviewerId }, transaction },
        );
        // 已发布：校对计时结束，课程不再进入任务池。
        await clearClaimDeadline(Number(draft.exercise_id), Number(draft.admin_user_id), transaction);
        await sequelize.query(
            `insert into exercise_contributions (exercise_id, admin_user_id, contribution_role)
             values (:exerciseId, :adminId, :role)
             on duplicate key update admin_user_id = values(admin_user_id), updated_at = current_timestamp`,
            {
                replacements: {
                    exerciseId: Number(draft.exercise_id),
                    adminId: Number(draft.admin_user_id),
                    role: 'proofreader',
                },
                transaction,
            },
        );
        await sequelize.query(
            `insert into exercise_contributions (exercise_id, admin_user_id, contribution_role)
             values (:exerciseId, :adminId, :role)
             on duplicate key update admin_user_id = values(admin_user_id), updated_at = current_timestamp`,
            {
                replacements: {
                    exerciseId: Number(draft.exercise_id),
                    adminId: reviewerId,
                    role: 'second_reviewer',
                },
                transaction,
            },
        );
        await sequelize.query(
            `insert into admin_workflow_notifications
               (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
             values (:recipientId, :reviewerId, :exerciseId, :draftId, 'subtitle_approved')`,
            {
                replacements: {
                    recipientId: Number(draft.admin_user_id), reviewerId,
                    exerciseId: Number(draft.exercise_id), draftId,
                },
                transaction,
            },
        );
        await recordWorkflowActivity({
            eventType: 'subtitle_approved',
            actorAdminUserId: reviewerId,
            targetAdminUserId: Number(draft.admin_user_id),
            exerciseId: Number(draft.exercise_id),
            subtitleDraftId: draftId,
            workflowRole: 'second_reviewer',
        }, transaction);
    });
}

/** 审核人只看到提交时已指派给自己的待审稿，避免管理员改人后任务漂移。 */
export async function listMySubtitleReviewTasks(adminId: number): Promise<AdminReviewTask[]> {
    const rows = await doRawQuery<{
        draft_id: number | string;
        exercise_id: number | string;
        exercise_title: string;
        contributor_display_name: string;
        submitted_at: Date | string;
    }>({
        query: `select drafts.id as draft_id, drafts.exercise_id, exercises.title as exercise_title,
                       contributors.display_name as contributor_display_name, drafts.submitted_at
                from exercise_subtitle_drafts drafts
                inner join exercises on exercises.id = drafts.exercise_id
                inner join admin_users contributors on contributors.id = drafts.admin_user_id
                where drafts.reviewer_admin_user_id = ? and drafts.status = 'submitted'
                order by drafts.submitted_at asc, drafts.id asc`,
        params: [adminId],
    });
    return rows.map((row) => ({
        draftId: Number(row.draft_id),
        exerciseId: Number(row.exercise_id),
        exerciseTitle: row.exercise_title,
        contributorDisplayName: row.contributor_display_name,
        submittedAt: new Date(row.submitted_at).toISOString(),
    }));
}

/** 返回当前成员负责的校对、审核、退回和最近完成记录，供统一任务中心使用。 */
export async function listMySubtitleWorkflowInbox(adminId: number): Promise<AdminSubtitleWorkflowTaskInbox> {
    const rows = await doRawQuery<{
        draft_id: number | string;
        exercise_id: number | string;
        exercise_title: string;
        contributor_display_name: string;
        proofreader_id: number | string | null;
        proofreader_source: CourseWorkflowAssignmentSource | null;
        proofreader_claim_expires_at: Date | string | null;
        reviewer_snapshot_id: number | string | null;
        draft_admin_id: number | string;
        reviewed_by_admin_user_id: number | string | null;
        status: SubtitleDraftStatus;
        submitted_at: Date | string | null;
        updated_at: Date | string | null;
        review_note: string | null;
    }>({
        query: `select drafts.id as draft_id, drafts.exercise_id, exercises.title as exercise_title,
                       contributors.display_name as contributor_display_name,
                       proofreader.admin_user_id as proofreader_id,
                       proofreader.assignment_source as proofreader_source,
                       proofreader.claim_expires_at as proofreader_claim_expires_at,
                       drafts.admin_user_id as draft_admin_id,
                       drafts.reviewer_admin_user_id as reviewer_snapshot_id,
                       drafts.reviewed_by_admin_user_id,
                       drafts.status,
                       drafts.submitted_at, drafts.updated_at, drafts.review_note
                from exercise_subtitle_drafts drafts
                inner join exercises on exercises.id = drafts.exercise_id
                inner join admin_users contributors on contributors.id = drafts.admin_user_id
                left join exercise_workflow_assignees proofreader
                  on proofreader.exercise_id = drafts.exercise_id and proofreader.workflow_role = 'proofreader'
                left join exercise_workflow_assignees reviewer
                  on reviewer.exercise_id = drafts.exercise_id and reviewer.workflow_role = 'second_reviewer'
                where (drafts.admin_user_id = :adminId
                       or drafts.reviewer_admin_user_id = :adminId
                       or drafts.reviewed_by_admin_user_id = :adminId)
                  and drafts.status in ('editing', 'submitted', 'returned', 'approved')
                order by drafts.updated_at desc, drafts.id desc
                limit 100`,
        params: { adminId },
    });
    const items: AdminSubtitleWorkflowTaskInbox['items'] = [];
    for (const row of rows) {
        const base = {
            draftId: Number(row.draft_id), exerciseId: Number(row.exercise_id), exerciseTitle: row.exercise_title,
            contributorDisplayName: row.contributor_display_name,
            submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
            reviewNote: row.review_note || undefined,
            assignmentSource: row.proofreader_source || undefined,
            claimExpiresAt: row.proofreader_claim_expires_at ? new Date(row.proofreader_claim_expires_at).toISOString() : undefined,
        };
        // 进行中的校对/退回任务只归属于实际投稿人，且校对人必须是当前负责人。
        if (Number(row.draft_admin_id) === adminId && Number(row.proofreader_id) === adminId && (row.status === 'editing' || row.status === 'returned')) {
            items.push({ ...base, role: 'proofreader', stage: row.status === 'returned' ? 'returned' : 'proofreading', draftStatus: row.status });
        }
        // 投稿提交时保存 reviewer 快照；之后重新分配负责人也不会把待审核任务漂移给别人。
        if (Number(row.reviewer_snapshot_id) === adminId && row.status === 'submitted') {
            items.push({ ...base, role: 'second_reviewer', stage: 'awaiting_review', draftStatus: row.status });
        }
        // 已完成记录按历史署名归属，不依据当前负责人推断，避免账号/负责人变更造成错配。
        if (row.status === 'approved' && Number(row.draft_admin_id) === adminId) {
            items.push({ ...base, role: 'proofreader', stage: 'completed', draftStatus: row.status });
        }
        if (row.status === 'approved' && Number(row.reviewed_by_admin_user_id) === adminId) {
            items.push({ ...base, role: 'second_reviewer', stage: 'completed', draftStatus: row.status });
        }
    }
    // 负责人刚被分配、尚未保存第一版个人草稿时，仍应在任务中心看到“待校对”。
    // 使用 draftId=0 作为尚未创建稿件的占位任务，点击课程列表即可进入编辑器。
    const unstartedRows = await doRawQuery<{
        exercise_id: number | string;
        exercise_title: string;
        assignment_source: CourseWorkflowAssignmentSource;
        claim_expires_at: Date | string | null;
    }>({
        query: `select assignees.exercise_id, exercises.title as exercise_title,
                       assignees.assignment_source, assignees.claim_expires_at
                from exercise_workflow_assignees assignees
                inner join exercises on exercises.id = assignees.exercise_id
                where assignees.workflow_role = 'proofreader'
                  and assignees.admin_user_id = :adminId
                  and (
                    assignees.assignment_source = 'admin_assigned'
                    or assignees.claim_expires_at is null
                    or assignees.claim_expires_at > utc_timestamp()
                  )
                  and not exists (
                    select 1 from exercise_subtitle_drafts drafts
                    where drafts.exercise_id = assignees.exercise_id
                      and drafts.admin_user_id = :adminId
                  )
                order by assignees.updated_at desc, assignees.exercise_id desc
                limit 100`,
        params: { adminId },
    });
    for (const row of unstartedRows) {
        items.push({
            draftId: 0,
            exerciseId: Number(row.exercise_id),
            exerciseTitle: row.exercise_title,
            contributorDisplayName: '尚未创建校对稿',
            role: 'proofreader',
            stage: 'proofreading',
            draftStatus: 'editing',
            assignmentSource: row.assignment_source,
            claimExpiresAt: row.claim_expires_at ? new Date(row.claim_expires_at).toISOString() : undefined,
        });
    }
    return {
        items,
        counts: {
            proofreading: items.filter((item) => item.stage === 'proofreading').length,
            awaitingReview: items.filter((item) => item.stage === 'awaiting_review').length,
            returned: items.filter((item) => item.stage === 'returned').length,
            completedProofreading: items.filter((item) => item.stage === 'completed' && item.role === 'proofreader').length,
            completedSecondReview: items.filter((item) => item.stage === 'completed' && item.role === 'second_reviewer').length,
        },
    };
}

export async function listMyWorkflowNotifications(adminId: number): Promise<AdminWorkflowNotifications> {
    const rows = await doRawQuery<WorkflowNotificationRow>({
        query: `select notifications.id, notifications.notification_type, notifications.exercise_id,
                       exercises.title as exercise_title, actors.display_name as actor_display_name,
                       notifications.review_note, notifications.is_read, notifications.created_at
                from admin_workflow_notifications notifications
                inner join exercises on exercises.id = notifications.exercise_id
                left join admin_users actors on actors.id = notifications.actor_admin_user_id
                where notifications.recipient_admin_user_id = ?
                order by notifications.created_at desc, notifications.id desc
                limit 50`,
        params: [adminId],
    });
    const unreadRows = await doRawQuery<{ total: number | string }>({
        query: `select count(*) as total from admin_workflow_notifications
                where recipient_admin_user_id = ? and is_read = false`,
        params: [adminId],
    });
    return {
        unreadCount: Number(unreadRows[0]?.total ?? 0),
        items: rows.map((row) => ({
            id: Number(row.id), type: row.notification_type,
            exerciseId: Number(row.exercise_id), exerciseTitle: row.exercise_title,
            actorDisplayName: row.actor_display_name || '系统', reviewNote: row.review_note || undefined,
            isRead: Boolean(row.is_read), createdAt: new Date(row.created_at).toISOString(),
        })),
    };
}

export async function markMyWorkflowNotificationsRead(adminId: number, notificationIds?: number[]) {
    const ids = [...new Set((notificationIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];
    await sequelize.query(
        `update admin_workflow_notifications set is_read = true
         where recipient_admin_user_id = :adminId${ids.length ? ' and id in (:ids)' : ''}`,
        { replacements: ids.length ? { adminId, ids } : { adminId } },
    );
}

type WorkflowActivityRow = {
    id: number | string;
    event_type: AdminWorkflowActivityType;
    actor_admin_user_id: number | string | null;
    target_admin_user_id: number | string | null;
    exercise_id: number | string;
    exercise_title: string;
    actor_display_name: string | null;
    target_display_name: string | null;
    subtitle_draft_id: number | string | null;
    workflow_role: CourseContributionRole | null;
    review_note: string | null;
    occurred_at: Date | string;
};

/**
 * 团队动态向所有已登录后台成员开放。响应附带操作者与接收者的内部 ID，
 * 仅用于客户端高亮当前成员的关联记录，界面仍只展示名称。
 */
export async function listWorkflowActivity({
    page = 1,
    pageSize = 50,
    memberId,
    eventType,
}: {
    page?: number;
    pageSize?: number;
    memberId?: number;
    eventType?: AdminWorkflowActivityType;
} = {}): Promise<AdminWorkflowActivityPage> {
    const resolvedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const resolvedPageSize = Number.isInteger(pageSize)
        ? Math.min(Math.max(pageSize, 10), 100)
        : 50;
    const normalizedMemberId = Number.isInteger(memberId) && (memberId ?? 0) > 0
        ? memberId
        : undefined;
    const filters: string[] = [];
    const params: Record<string, number | string> = {
        limit: resolvedPageSize,
        offset: (resolvedPage - 1) * resolvedPageSize,
    };
    if (normalizedMemberId) {
        filters.push('(events.actor_admin_user_id = :memberId or events.target_admin_user_id = :memberId)');
        params.memberId = normalizedMemberId;
    }
    if (eventType) {
        filters.push('events.event_type = :eventType');
        params.eventType = eventType;
    }
    const whereClause = filters.length ? `where ${filters.join(' and ')}` : '';
    const [rows, totalRows] = await Promise.all([
        doRawQuery<WorkflowActivityRow>({
            query: `select events.id, events.event_type, events.actor_admin_user_id, events.target_admin_user_id,
                           events.exercise_id,
                           coalesce(exercises.title, concat('已删除课程 #', events.exercise_id)) as exercise_title,
                           actor.display_name as actor_display_name,
                           target.display_name as target_display_name,
                           events.subtitle_draft_id, events.workflow_role, events.review_note, events.occurred_at
                    from admin_workflow_activity_events events
                    left join exercises on exercises.id = events.exercise_id
                    left join admin_users actor on actor.id = events.actor_admin_user_id
                    left join admin_users target on target.id = events.target_admin_user_id
                    ${whereClause}
                    order by events.occurred_at desc, events.id desc
                    limit :limit offset :offset`,
            params,
        }),
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total from admin_workflow_activity_events events ${whereClause}`,
            params: normalizedMemberId || eventType
                ? Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'limit' && key !== 'offset'))
                : {},
        }),
    ]);

    const items: AdminWorkflowActivity[] = rows.map((row) => ({
        id: Number(row.id),
        type: row.event_type,
        exerciseId: Number(row.exercise_id),
        exerciseTitle: row.exercise_title,
        actorAdminUserId: row.actor_admin_user_id === null ? undefined : Number(row.actor_admin_user_id),
        targetAdminUserId: row.target_admin_user_id === null ? undefined : Number(row.target_admin_user_id),
        actorDisplayName: row.actor_display_name || undefined,
        targetDisplayName: row.target_display_name || undefined,
        workflowRole: row.workflow_role || undefined,
        subtitleDraftId: row.subtitle_draft_id === null ? undefined : Number(row.subtitle_draft_id),
        reviewNote: row.review_note || undefined,
        occurredAt: new Date(row.occurred_at).toISOString(),
    }));
    return {
        items,
        page: resolvedPage,
        pageSize: resolvedPageSize,
        total: Number(totalRows[0]?.total ?? 0),
    };
}

export async function recordExerciseContribution({
    exerciseId,
    adminId,
    role,
}: {
    exerciseId: number;
    adminId: number;
    role: CourseContributionRole;
}) {
    await sequelize.query(
        `insert into exercise_contributions (exercise_id, admin_user_id, contribution_role)
         values (:exerciseId, :adminId, :role)
         on duplicate key update admin_user_id = values(admin_user_id), updated_at = current_timestamp`,
        { replacements: { exerciseId, adminId, role } },
    );
}

export async function listExerciseContributors(exerciseId: number) {
    const rows = await doRawQuery<{
        display_name: string;
        contribution_role: CourseContributionRole;
    }>({
        query: `
            select admin_users.display_name, exercise_contributions.contribution_role
            from exercise_contributions
            inner join admin_users on admin_users.id = exercise_contributions.admin_user_id
            where exercise_contributions.exercise_id = ?
            order by field(exercise_contributions.contribution_role, 'proofreader', 'second_reviewer')
        `,
        params: [exerciseId],
    });
    const byName = new Map<string, CourseContributionRole[]>();
    for (const row of rows) {
        byName.set(row.display_name, [...(byName.get(row.display_name) ?? []), row.contribution_role]);
    }
    return [...byName.entries()].map(([displayName, roles]) => ({ displayName, roles }));
}

/**
 * 学习端只需知道课程由谁校对、谁二审。该查询刻意只返回展示名称，
 * 不会泄露后台账号 ID、邮箱、草稿状态或审核意见。
 */
export async function getExerciseWorkflowCredits(exerciseId: number): Promise<CourseWorkflowCredits | undefined> {
    const rows = await doRawQuery<{
        workflow_role: CourseContributionRole;
        display_name: string;
    }>({
        query: `
            select assignees.workflow_role, admins.display_name
            from exercise_workflow_assignees assignees
            inner join admin_users admins on admins.id = assignees.admin_user_id
            where assignees.exercise_id = ?
        `,
        params: [exerciseId],
    });
    const credits: CourseWorkflowCredits = {};
    for (const row of rows) {
        if (row.workflow_role === 'proofreader') {
            credits.proofreaderDisplayName = row.display_name;
        }
        if (row.workflow_role === 'second_reviewer') {
            credits.secondReviewerDisplayName = row.display_name;
        }
    }
    return credits.proofreaderDisplayName || credits.secondReviewerDisplayName
        ? credits
        : undefined;
}

/** 默认只返回已保存的志愿者；提供搜索词时才查找学习端成员，避免后台首屏加载全量用户。 */
export async function listPreviewVolunteers(search?: string) {
    const normalizedSearch = search?.trim().slice(0, 120) ?? '';
    const rows = await UserModel.findAll({
        attributes: ['id', 'email', 'display_name', 'is_preview_volunteer'],
        where: normalizedSearch
            ? { [Op.or]: [{ email: { [Op.like]: `%${normalizedSearch}%` } }, { display_name: { [Op.like]: `%${normalizedSearch}%` } }] }
            : { is_preview_volunteer: true },
        order: [['created_at', 'DESC']],
        limit: normalizedSearch ? 50 : undefined,
        raw: true,
    }) as unknown as Array<{
        id: number | string;
        email: string;
        display_name: string;
        is_preview_volunteer: boolean | number;
    }>;
    return rows.map((row) => ({
        id: Number(row.id),
        email: row.email,
        displayName: row.display_name,
        isPreviewVolunteer: Boolean(row.is_preview_volunteer),
    }));
}

export async function updatePreviewVolunteer(userId: number, isPreviewVolunteer: boolean) {
    const [updated] = await UserModel.update(
        { is_preview_volunteer: isPreviewVolunteer } as any,
        { where: { id: userId } },
    );
    if (!updated) throw new Error('学习用户不存在');
}

export async function isPreviewVolunteer(userId: number | undefined) {
    if (!userId) return false;
    const user = await UserModel.findOne({
        where: { id: userId },
        attributes: ['is_preview_volunteer'],
        raw: true,
    }) as unknown as { is_preview_volunteer?: boolean } | null;
    return Boolean(user?.is_preview_volunteer);
}
