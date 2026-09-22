import { doRawQuery } from '../../../models';
import type { AdminRole } from '../../../domain';
import { AdminUserModel } from '../../../models/schema/AdminUserDB';
import { UserModel } from '../../../models/schema/UserDB';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { normalizeAdminRole } from './policy';

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
                  and assignees.workflow_role in ('proofreader', 'second_reviewer')
                  and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())
                  and (
                    assignees.workflow_role = 'proofreader'
                    or not exists (
                      select 1 from exercise_workflow_assignees expired_proofreader
                      where expired_proofreader.exercise_id = assignees.exercise_id
                        and expired_proofreader.workflow_role = 'proofreader'
                        and expired_proofreader.claim_expires_at is not null
                        and expired_proofreader.claim_expires_at <= utc_timestamp()
                    )
                  )`,
        params: { userId },
    });
    return rows.map((row) => Number(row.exercise_id));
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
