import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { AdminUserModel } from '../../models/schema/AdminUserDB';
import { UserModel } from '../../models/schema/UserDB';
import { normalizeAdminRole } from './collaboration-service';

export type AdminSessionUser = {
    id: number;
    email: string;
    displayName: string;
    role: 'super_admin' | 'subtitle_contributor';
    isActive: boolean;
    mustChangePassword: boolean;
    createdAt?: string;
    lastLoginAt?: string;
    nextDisplayNameChangeAt?: string;
    learnerUserId?: number;
    learnerEmail?: string;
    learnerDisplayName?: string;
};

export type AdminAuthResult = {
    success: boolean;
    message: string;
    data?: {
        user: AdminSessionUser;
        token: string;
    };
};

const plainAdmin = (admin: any) => (typeof admin.get === 'function' ? admin.get({ plain: true }) : admin);
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// 贡献会公开署名在课程中，90 天的间隔避免名称频繁变动而难以追溯历史贡献。
const DISPLAY_NAME_CHANGE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
const hashAdminToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const getNextDisplayNameChangeAt = (lastChangedAt: Date | string | null | undefined) => {
    if (!lastChangedAt) return undefined;
    const nextChangeAt = new Date(lastChangedAt).getTime() + DISPLAY_NAME_CHANGE_COOLDOWN_MS;
    return nextChangeAt > Date.now() ? new Date(nextChangeAt).toISOString() : undefined;
};

const mapAdminUser = (admin: any, learner?: { id: number; email: string; display_name: string } | null): AdminSessionUser => {
    const row = plainAdmin(admin);
    return {
        id: Number(row.id),
        // 旧账号尚未补邮箱时仍用 username 显示和登录，避免迁移时中断既有管理员。
        email: row.email || row.username,
        displayName: row.display_name,
        role: normalizeAdminRole(row.role),
        isActive: Boolean(row.is_active),
        mustChangePassword: Boolean(row.must_change_password),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : undefined,
        nextDisplayNameChangeAt: getNextDisplayNameChangeAt(row.last_display_name_changed_at),
        learnerUserId: learner ? Number(learner.id) : undefined,
        learnerEmail: learner?.email,
        learnerDisplayName: learner?.display_name,
    };
};

/** 后台会话资料独立加载绑定的学习端账号，避免把后台账号邮箱误当成学习端身份展示。 */
async function mapAdminUserWithLearner(admin: any): Promise<AdminSessionUser> {
    const row = plainAdmin(admin);
    const learner = row.learner_user_id
        ? await UserModel.findByPk(row.learner_user_id, {
            attributes: ['id', 'email', 'display_name'],
            raw: true,
        }) as unknown as { id: number; email: string; display_name: string } | null
        : null;
    return mapAdminUser(row, learner);
}

export async function loginAdmin({
    email,
    password,
}: {
    email: string;
    password: string;
}): Promise<AdminAuthResult> {
    const adminRecord = await AdminUserModel.findOne({
        // 新后台成员以邮箱登录；兼容原有 username 账号，便于平滑迁移。
        where: {
            [Op.or]: [
                { email: email.trim().toLowerCase() },
                { username: email.trim().toLowerCase() },
            ],
        },
    });

    if (!adminRecord) {
        return { success: false, message: 'Invalid email or password' };
    }

    const row = plainAdmin(adminRecord);
    if (!row.is_active) {
        return { success: false, message: '该后台账号已停用，请联系超级管理员' };
    }
    const matched = await bcrypt.compare(password, row.password_hash);
    if (!matched) {
        return { success: false, message: 'Invalid email or password' };
    }

    const user = await mapAdminUserWithLearner(row);
    const token = uuidv4();
    await AdminUserModel.update(
        {
            // 浏览器持有原始 bearer token；数据库只保存不可逆摘要，数据库只读泄露
            // 不再能直接转换为管理员会话。过期时间为绝对 UTC 时间。
            token: hashAdminToken(token),
            token_expires_at: new Date(Date.now() + ADMIN_SESSION_TTL_MS),
            last_login_at: new Date(),
        },
        { where: { id: user.id } },
    );

    return {
        success: true,
        message: 'success',
        data: { user, token },
    };
}

export async function getAdminByToken(token: string) {
    const adminRecord = await AdminUserModel.findOne({
        where: { token: hashAdminToken(token) },
        raw: true,
    });

    if (!adminRecord || !adminRecord.token_expires_at || !adminRecord.is_active) {
        if (adminRecord && !adminRecord.is_active) {
            await AdminUserModel.update(
                { token: null, token_expires_at: null },
                { where: { id: adminRecord.id } },
            );
        }
        return null;
    }

    if (new Date(adminRecord.token_expires_at).getTime() <= Date.now()) {
        await AdminUserModel.update(
            { token: null, token_expires_at: null },
            { where: { id: adminRecord.id } },
        );
        return null;
    }

    return mapAdminUserWithLearner(adminRecord);
}

export async function logoutAdmin(adminId: number) {
    await AdminUserModel.update(
        { token: null, token_expires_at: null },
        { where: { id: adminId } },
    );
}

/**
 * 新成员首次登录必须用临时密码完成本操作。改密不会切换当前会话，
 * 以免管理员在提交成功后被意外登出；重设密码则由人员管理接口撤销其旧会话。
 */
export async function changeAdminPassword({
    adminId,
    currentPassword,
    newPassword,
}: {
    adminId: number;
    currentPassword: string;
    newPassword: string;
}): Promise<{ success: boolean; message: string; data?: AdminSessionUser }> {
    const adminRecord = await AdminUserModel.findOne({ where: { id: adminId } });
    if (!adminRecord) {
        return { success: false, message: '后台账号不存在' };
    }

    const row = plainAdmin(adminRecord);
    const passwordMatches = await bcrypt.compare(currentPassword, row.password_hash);
    if (!passwordMatches) {
        return { success: false, message: '当前密码不正确' };
    }
    if (currentPassword === newPassword) {
        return { success: false, message: '新密码不能与当前密码相同' };
    }

    await AdminUserModel.update(
        {
            password_hash: await bcrypt.hash(newPassword, 10),
            must_change_password: false,
        },
        { where: { id: adminId } },
    );

    return {
        success: true,
        message: 'success',
        data: { ...(await mapAdminUserWithLearner(row)), mustChangePassword: false },
    };
}

/**
 * 贡献者可以自行修改公开署名，但以数据库中的时间戳为准执行 90 天冷却。
 * 条件更新把“检查冷却期”和“写入新名称”绑定在一起，避免并发请求绕过限制。
 */
export async function changeOwnAdminDisplayName({
    adminId,
    displayName,
}: {
    adminId: number;
    displayName: string;
}): Promise<{ success: boolean; message: string; data?: AdminSessionUser }> {
    const normalizedDisplayName = displayName.trim();
    if (!normalizedDisplayName) {
        return { success: false, message: '请填写显示名称' };
    }

    const adminRecord = await AdminUserModel.findByPk(adminId);
    if (!adminRecord) {
        return { success: false, message: '后台账号不存在' };
    }
    const row = plainAdmin(adminRecord);
    if (normalizeAdminRole(row.role) !== 'subtitle_contributor') {
        return { success: false, message: '仅字幕贡献者可以自行修改显示名称' };
    }
    if (row.display_name === normalizedDisplayName) {
        return { success: false, message: '新显示名称与当前名称相同' };
    }

    const now = new Date();
    const nextChangeAt = getNextDisplayNameChangeAt(row.last_display_name_changed_at);
    if (nextChangeAt) {
        return { success: false, message: `显示名称每 90 天只能修改一次，请在 ${nextChangeAt} 后再试` };
    }

    const cooldownCutoff = new Date(now.getTime() - DISPLAY_NAME_CHANGE_COOLDOWN_MS);
    const [updatedCount] = await AdminUserModel.update(
        {
            display_name: normalizedDisplayName,
            last_display_name_changed_at: now,
        },
        {
            where: {
                id: adminId,
                [Op.or]: [
                    { last_display_name_changed_at: null },
                    { last_display_name_changed_at: { [Op.lte]: cooldownCutoff } },
                ],
            },
        },
    );
    if (updatedCount !== 1) {
        // 两次请求同时到达时，第二次会在条件更新处失败，仍需保留冷却规则。
        return { success: false, message: '显示名称刚刚修改过，请在 90 天后再试' };
    }

    const updatedAdmin = await AdminUserModel.findByPk(adminId);
    return {
        success: true,
        message: 'success',
        data: await mapAdminUserWithLearner(updatedAdmin),
    };
}

export async function getAdminInfo(token: string) {
    const user = await getAdminByToken(token);
    if (!user) {
        return { success: false, message: 'Admin session is not valid' };
    }

    return {
        success: true,
        message: 'success',
        data: user,
    };
}
