import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import { QueryTypes } from 'sequelize';
import type {
    AdminRole,
    CourseContributionRole,
    CourseWorkflowCredits,
    CreateTranscriptLineRequest,
    SubtitleDraft,
    SubtitleDraftStatus,
    TranscriptLine,
} from '../../domain';
import { doRawQuery } from '../../models';
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
};

/** 人员管理需要同时列出超级管理员和字幕贡献者；课程分配仅对后者有效。 */
export async function listAdminMembers() {
    const rows = await doRawQuery<AdminMemberRow>({
        query: `
            select a.id, a.username, a.email, a.display_name, a.role, a.must_change_password,
                   a.is_active, a.created_at, a.last_login_at, assignments.exercise_id
            from admin_users a
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
        };
        if (row.exercise_id && existing.role === 'subtitle_contributor') {
            existing.assignedExerciseIds.push(Number(row.exercise_id));
        }
        members.set(id, existing);
    }
    return [...members.values()];
}

const normalizeAssignedExerciseIds = (ids: unknown) =>
    [...new Set(
        (Array.isArray(ids) ? ids : [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
    )];

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
    });
    return exerciseIds;
}

/** 从课程维度维护授权，供课程列表中的贡献者下拉框直接调用。 */
/**
 * 为一个工作流步骤指定唯一负责人。校对与二审都由字幕贡献者承担：
 * 两个步骤可由同一位成员完成；超级管理员只负责配置，不会被误写入贡献者工作流。指定校对人时同步保留
 * 旧课程授权表中的编辑资格，以兼容贡献者课程列表与字幕编辑入口。
 */
export async function updateExerciseWorkflowAssignee({
    exerciseId,
    workflowRole,
    adminUserId,
}: {
    exerciseId: number;
    workflowRole: CourseContributionRole;
    adminUserId: number | null;
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
        await sequelize.query(
            `delete from exercise_workflow_assignees
             where exercise_id = :exerciseId and workflow_role = :workflowRole`,
            { replacements: { exerciseId, workflowRole }, transaction },
        );
        if (adminUserId !== null) {
            await sequelize.query(
                `insert into exercise_workflow_assignees (exercise_id, workflow_role, admin_user_id)
                 values (:exerciseId, :workflowRole, :adminUserId)`,
                { replacements: { exerciseId, workflowRole, adminUserId }, transaction },
            );
            if (workflowRole === 'proofreader') {
                // 课程编辑权限由“校对负责人”派生，避免配置完还需重复授权。
                await sequelize.query(
                    `insert into exercise_contributor_assignments (exercise_id, admin_user_id)
                     values (:exerciseId, :adminUserId)
                     on duplicate key update admin_user_id = values(admin_user_id)`,
                    { replacements: { exerciseId, adminUserId }, transaction },
                );
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
export async function updateAdminMemberProfile({ memberId, email, displayName, role }: {
    memberId: number;
    email: string;
    displayName: string;
    role: AdminRole;
}) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedDisplayName = displayName.trim();
    if (!normalizedEmail || !normalizedDisplayName) throw new Error('请填写邮箱和成员名称');
    const member = await AdminUserModel.findByPk(memberId);
    if (!member) throw new Error('后台成员不存在');
    if (member.role === 'super_admin' && role !== 'super_admin') {
        const activeSuperAdminCount = await AdminUserModel.count({ where: { role: 'super_admin', is_active: true } });
        if (activeSuperAdminCount <= 1) throw new Error('至少需要保留一名正常状态的超级管理员');
    }
    const duplicate = await AdminUserModel.findOne({
        where: { [Op.or]: [{ email: normalizedEmail }, { username: normalizedEmail }] },
    });
    if (duplicate && Number(duplicate.id) !== memberId) throw new Error('该后台登录邮箱已被使用');
    await AdminUserModel.update(
        { email: normalizedEmail, username: normalizedEmail, display_name: normalizedDisplayName, role },
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

export async function getAssignedExerciseIds(adminId: number) {
    const rows = await doRawQuery<{ exercise_id: number | string }>({
        // 校对人与二审人都需要在“课程管理”中看见任务；旧的编辑授权关系继续兼容。
        query: `select exercise_id from exercise_contributor_assignments where admin_user_id = ?
                union
                select exercise_id from exercise_workflow_assignees where admin_user_id = ?`,
        params: [adminId, adminId],
    });
    return rows.map((row) => Number(row.exercise_id));
}

export async function canEditExerciseSubtitles(admin: AdminActor, exerciseId: number) {
    if (isSuperAdmin(admin)) return true;
    const rows = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_contributor_assignments
                where admin_user_id = ? and exercise_id = ? limit 1`,
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
                where exercise_id = ? and admin_user_id = ? and workflow_role = ? limit 1`,
        params: [exerciseId, adminId, workflowRole],
    });
    return rows.length > 0;
}

/** 课程详情对两种负责人均可见；但只有校对负责人可修改并提交字幕。 */
export async function canAccessExerciseWorkflow(admin: AdminActor, exerciseId: number) {
    if (isSuperAdmin(admin)) return true;
    if (await canEditExerciseSubtitles(admin, exerciseId)) return true;
    return (await isWorkflowAssignee(exerciseId, admin.id, 'second_reviewer'));
}

/**
 * 仅课程指定的校对负责人可提交，避免把“可编辑”误当成“可提交二审”。
 * 尚未采用负责人机制的旧课程，保留原先“被授权即可提交”的兼容行为。
 */
export async function canSubmitSubtitleDraft(admin: AdminActor, exerciseId: number) {
    const proofreaderIsAssigned = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_workflow_assignees
                where exercise_id = ? and workflow_role = 'proofreader' limit 1`,
        params: [exerciseId],
    });
    return proofreaderIsAssigned.length > 0
        ? isWorkflowAssignee(exerciseId, admin.id, 'proofreader')
        : canEditExerciseSubtitles(admin, exerciseId);
}

/** 二次审核也由贡献者承担，必须由本课已配置的二审负责人完成。 */
export async function canReviewSubtitleDraft(admin: AdminActor, exerciseId: number) {
    return isWorkflowAssignee(exerciseId, admin.id, 'second_reviewer');
}

type SubtitleDraftRow = {
    id: number | string;
    exercise_id: number | string;
    admin_user_id: number | string;
    display_name: string;
    transcript_json: unknown;
    status: SubtitleDraftStatus;
    review_note: string | null;
    submitted_at: Date | string | null;
    updated_at: Date | string | null;
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
    const scope = options?.submittedOnly || reviewerCanSeeSubmitted
        ? `and drafts.status = 'submitted'`
        : 'and drafts.admin_user_id = :adminId';
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

/** 学习端志愿者只读取最新一份已提交稿，绝不暴露贡献者的个人编辑稿。 */
export async function getLatestSubmittedSubtitleDraft(exerciseId: number) {
    const rows = await doRawQuery<SubtitleDraftRow>({
        query: `
            select drafts.id, drafts.exercise_id, drafts.admin_user_id, admins.display_name,
                   drafts.transcript_json, drafts.status, drafts.review_note,
                   drafts.submitted_at, drafts.updated_at
            from exercise_subtitle_drafts drafts
            inner join admin_users admins on admins.id = drafts.admin_user_id
            where drafts.exercise_id = :exerciseId and drafts.status = 'submitted'
            order by drafts.submitted_at desc, drafts.updated_at desc
            limit 1
        `,
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
        throw new Error('该字幕稿已提交二次审核，请等待审核结果或由管理员退回后再修改');
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
        throw new Error('该字幕稿已在二次审核队列中');
    }
    await sequelize.transaction(async (transaction) => {
        const [exercise] = await sequelize.query<{ status: string }>(
            'select status from exercises where id = :exerciseId limit 1',
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        if (!exercise) throw new Error('课程不存在');
        await sequelize.query(
            `insert into exercise_subtitle_drafts
           (exercise_id, admin_user_id, transcript_json, status, review_note, submitted_at, reviewed_at, reviewed_by_admin_user_id)
         values (:exerciseId, :adminId, cast(:transcriptJson as json), 'submitted', null, current_timestamp, null, null)
         on duplicate key update
           transcript_json = values(transcript_json),
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
    const [, metadata] = await sequelize.query(
        `update exercise_subtitle_drafts
         set status = 'returned', review_note = :reviewNote, reviewed_at = current_timestamp,
             reviewed_by_admin_user_id = :reviewerId
         where id = :draftId and status = 'submitted'`,
        { replacements: { draftId, reviewerId, reviewNote } },
    );
    if ((metadata as { affectedRows?: number }).affectedRows === 0) {
        throw new Error('这份字幕稿已不在待审核队列中');
    }

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
        { replacements: { draftId } },
    );
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
            `select drafts.id, drafts.exercise_id, drafts.admin_user_id, admins.display_name,
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
    });
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

export async function listPreviewVolunteers() {
    const rows = await UserModel.findAll({
        attributes: ['id', 'email', 'display_name', 'is_preview_volunteer'],
        order: [['created_at', 'DESC']],
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
