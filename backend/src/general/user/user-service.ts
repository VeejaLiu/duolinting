import bcrypt from 'bcryptjs';
import type { AuthUser, RegisterRequest } from '../../domain';
import { UserModel } from '../../models/schema/UserDB';
import {
    issueUserSession,
    normalizeAuthClientType,
    revokeAllUserSessions,
} from './user-session-service';

export type AuthResult = {
    success: boolean;
    message: string;
    data?: {
        user: AuthUser;
        token: string;
    };
};

const plainUser = (user: any) => (typeof user.get === 'function' ? user.get({ plain: true }) : user);

const mapUser = (user: any): AuthUser => {
    const row = plainUser(user);
    return {
        id: Number(row.id),
        email: row.email,
        displayName: row.display_name,
    };
};

export async function findUserByEmail(email: string) {
    return UserModel.findOne({
        where: { email: email.toLowerCase() },
    });
}

export async function registerUser(request: RegisterRequest): Promise<AuthResult> {
    const existing = await findUserByEmail(request.email);
    if (existing) {
        return { success: false, message: 'Email already registered' };
    }

    const passwordHash = await bcrypt.hash(request.password, 10);
    const createdUser = await UserModel.create({
        email: request.email.toLowerCase(),
        display_name: request.displayName,
        password_hash: passwordHash,
    } as any);

    const row = plainUser(createdUser);
    const user = {
        id: Number(row.id),
        email: request.email.toLowerCase(),
        displayName: request.displayName,
    };
    const token = await issueUserSession({
        userId: user.id,
        clientType: normalizeAuthClientType(request.clientType),
    });

    return {
        success: true,
        message: 'success',
        data: { user, token },
    };
}

export async function loginUser({
    email,
    password,
    clientType,
}: {
    email: string;
    password: string;
    clientType?: unknown;
}): Promise<AuthResult> {
    const userRecord = await findUserByEmail(email);
    if (!userRecord) {
        return { success: false, message: 'Invalid email or password' };
    }

    const passwordHash = plainUser(userRecord).password_hash;
    const matched = passwordHash ? await bcrypt.compare(password, passwordHash) : false;
    if (!matched) {
        return { success: false, message: 'Invalid email or password' };
    }

    const user = mapUser(userRecord);
    const token = await issueUserSession({
        userId: user.id,
        clientType: normalizeAuthClientType(clientType),
    });

    return {
        success: true,
        message: 'success',
        data: { user, token },
    };
}

export async function getUserInfo({ userId }: { userId: string | number }) {
    const userRecord = await UserModel.findOne({ where: { id: userId } });
    if (!userRecord) {
        return { success: false, message: 'User not found' };
    }

    return {
        success: true,
        message: 'success',
        data: mapUser(userRecord),
    };
}

/**
 * 修改密码必须先比对当前密码，再写入 bcrypt 哈希。成功后撤销全部旧会话，
 * 并给当前客户端签发新 token，避免旧密码泄露后已登录设备继续长期有效。
 */
export async function changeUserPassword({
    userId,
    currentPassword,
    newPassword,
    clientType,
}: {
    userId: string | number;
    currentPassword: string;
    newPassword: string;
    clientType?: unknown;
}): Promise<AuthResult> {
    const userRecord = await UserModel.findOne({ where: { id: userId } });
    if (!userRecord) {
        return { success: false, message: 'User not found' };
    }

    const row = plainUser(userRecord);
    const passwordMatches = row.password_hash
        ? await bcrypt.compare(currentPassword, row.password_hash)
        : false;
    if (!passwordMatches) {
        return { success: false, message: 'Current password is incorrect' };
    }

    await UserModel.update(
        { password_hash: await bcrypt.hash(newPassword, 10) },
        { where: { id: userId } },
    );
    await revokeAllUserSessions(userId);

    const user = mapUser(userRecord);
    const token = await issueUserSession({
        userId: user.id,
        clientType: normalizeAuthClientType(clientType),
    });

    return {
        success: true,
        message: 'success',
        data: { user, token },
    };
}
