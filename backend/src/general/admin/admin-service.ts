import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { AdminUserModel } from '../../models/schema/AdminUserDB';

export type AdminSessionUser = {
    id: number;
    username: string;
    displayName: string;
    role: string;
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
        username: row.username,
        displayName: row.display_name,
        role: row.role,
    };
};

export async function loginAdmin({
    username,
    password,
}: {
    username: string;
    password: string;
}): Promise<AdminAuthResult> {
    const adminRecord = await AdminUserModel.findOne({
        where: { username: username.trim().toLowerCase() },
    });

    if (!adminRecord) {
        return { success: false, message: 'Invalid username or password' };
    }

    const row = plainAdmin(adminRecord);
    const matched = await bcrypt.compare(password, row.password_hash);
    if (!matched) {
        return { success: false, message: 'Invalid username or password' };
    }

    const user = mapAdminUser(row);
    const token = uuidv4();
    await AdminUserModel.update(
        {
            // 浏览器持有原始 bearer token；数据库只保存不可逆摘要，数据库只读泄露
            // 不再能直接转换为管理员会话。过期时间为绝对 UTC 时间。
            token: hashAdminToken(token),
            token_expires_at: new Date(Date.now() + ADMIN_SESSION_TTL_MS),
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

    if (!adminRecord || !adminRecord.token_expires_at) {
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
