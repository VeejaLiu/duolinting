import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { AdminUserModel } from '../../models/schema/AdminUserDB';
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
const hashAdminToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const mapAdminUser = (admin: any): AdminSessionUser => {
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
    };
};

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

    const user = mapAdminUser(row);
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

    return mapAdminUser(adminRecord);
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
        data: { ...mapAdminUser(row), mustChangePassword: false },
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
