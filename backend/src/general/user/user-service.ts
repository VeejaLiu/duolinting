import { createHash, randomUUID } from 'node:crypto';
import type { GeoContext } from '../analytics/geo';
import { rows, write, json, utcValue } from '../analytics/service';
import bcrypt from 'bcryptjs';
import type { AuthUser, RegisterRequest, ResetPasswordRequest } from '../../domain';
import { sequelize } from '../../models/db-config-mysql';
import { UserModel } from '../../models/schema/UserDB';
import { UserSessionModel } from '../../models/schema/UserSessionDB';
import { consumeUserEmailChallenge, emailVerificationRequired } from './user-email-challenge-service';
import {
    issueUserSession,
    normalizeAuthClientType,
    revokeAllUserSessions,
} from './user-session-service';

export type AuthResult = {
    success: boolean;
    message: string;
    code?: string;
    data?: {
        user: AuthUser;
        token: string;
    };
};

export type DeleteAccountResult = {
    success: boolean;
    message: string;
    data?: {
        deleted: true;
    };
};

export type PasswordResetResult = {
    success: boolean;
    message: string;
    code?: string;
    data?: {
        reset: true;
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

export async function registerUser(request: RegisterRequest, geo?: GeoContext, analyticsEpoch?: string): Promise<AuthResult> {
    const normalizedEmail = request.email.toLowerCase();
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
        return { success: false, message: 'Email already registered', code: 'EMAIL_ALREADY_REGISTERED' };
    }

    const passwordHash = await bcrypt.hash(request.password, 10);
    const createdUser = await sequelize.transaction(async (transaction) => {
      if (emailVerificationRequired()) {
        await consumeUserEmailChallenge({
          email: normalizedEmail,
          purpose: 'register',
          code: request.verificationCode,
          transaction,
        });
      }
      const account = await UserModel.create({
        email: normalizedEmail,
        display_name: request.displayName,
        password_hash: passwordHash,
    } as any, { transaction });
      await write('insert into analytics_user_profiles(user_id,registration_country) values(:id,:country)', { id: plainUser(account).id, country: geo?.countryCode ?? 'unknown' }, transaction);
      const context = analyticsEpoch && /^[a-f0-9]{64}$/.test(analyticsEpoch) ? (await rows('select * from analytics_sessions where identity_epoch=:epoch and user_id is null and revoked_at is null and expires_at>UTC_TIMESTAMP(3) for update', {epoch:createHash('sha256').update(analyticsEpoch).digest('hex')}, transaction))[0] : undefined;
      if(context && Date.now()-utcValue(context.last_activity_at)<30*60000) {
        const source=json<Record<string,string>>(context.attribution).utm_source ?? 'direct_or_unknown';
        await write('update analytics_user_profiles set registration_source=:source where user_id=:id',{source,id:plainUser(account).id},transaction);
        await write(`insert into analytics_events(event_id,event_name,user_id,anonymous_id,identity_epoch,analytics_session_id,seq,event_at,received_at,stat_date,client_type,surface,environment,country_code,geo_source,app_build,properties) values(:id,'signup_completed',:userId,:anon,:epoch,:session,0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),date(UTC_TIMESTAMP()+interval 8 hour),:client,'learner',:environment,:country,:source,'server','{}')`,{id:randomUUID(),userId:plainUser(account).id,anon:context.anonymous_id,epoch:context.identity_epoch,session:context.analytics_session_id,client:context.client_type,environment:context.environment,country:geo?.countryCode??'unknown',source:geo?.source??'unknown'},transaction);
      }

      return account;
    });

    const row = plainUser(createdUser);
    const user = {
        id: Number(row.id),
        email: normalizedEmail,
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

/**
 * Password recovery consumes a single-use email code, replaces the bcrypt
 * password hash, and revokes every existing session in one transaction. A
 * recovered account therefore cannot keep an attacker logged in elsewhere.
 */
export async function resetUserPassword(request: ResetPasswordRequest): Promise<PasswordResetResult> {
    const normalizedEmail = request.email.trim().toLowerCase();
    const userRecord = await UserModel.findOne({ where: { email: normalizedEmail } });
    if (!userRecord) {
        return {
            success: false,
            message: 'Email code is invalid.',
            code: 'EMAIL_CODE_INVALID',
        };
    }

    await sequelize.transaction(async (transaction) => {
        await consumeUserEmailChallenge({
            email: normalizedEmail,
            purpose: 'password_reset',
            code: request.verificationCode,
            transaction,
        });
        await UserModel.update(
            { password_hash: await bcrypt.hash(request.newPassword, 10) },
            { where: { id: userRecord.id }, transaction },
        );
        await UserSessionModel.update(
            { revoked_at: new Date() },
            { where: { user_id: userRecord.id }, transaction },
        );
    });

    return {
        success: true,
        message: 'success',
        data: { reset: true },
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

/**
 * 删除学习账号及其全部账号级数据。
 *
 * 这些表没有数据库外键，因此必须在一个事务中显式清理所有 user_id
 * 关联记录，再删除 users 主记录；否则会留下不可见的学习数据或悬空关联。
 * admin_users 不是学习账号数据，保留后台账号本身，只解除它与学习账号的绑定。
 */
export async function deleteUserAccount({
    userId,
    currentPassword,
}: {
    userId: string | number;
    currentPassword: string;
}): Promise<DeleteAccountResult> {
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
        return { success: false, message: 'User not found' };
    }

    const userRecord = await UserModel.findByPk(numericUserId);
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

    await sequelize.transaction(async (transaction) => {
        // Serialize account deletion with analytics ingestion so no events can arrive after cleanup.
        await sequelize.query('select id from users where id = ? for update', { replacements: [numericUserId], transaction });
        // Keep this list explicit: each table is an account-owned data store,
        // and the fixed names avoid turning user input into SQL identifiers.
        const userOwnedTables = [
            'analytics_events',
            'analytics_sessions',
            'analytics_user_profiles',
            'analytics_user_daily',
            'analytics_user_dimension_daily',
            'user_sessions',
            'exercise_progress',
            'line_progress',
            'vocabulary_items',
            'accepted_answer_feedback',
            'user_preferences',
            'user_daily_activity',
            'user_activity_operations',
            'user_access_daily',
        ];

        for (const tableName of userOwnedTables) {
            await sequelize.query(`delete from ${tableName} where user_id = ?`, {
                replacements: [numericUserId],
                transaction,
            });
        }

        // A subtitle contributor may also have a learner account. Preserve the
        // admin identity and its content history, but remove the deleted link.
        await sequelize.query(
            'update admin_users set learner_user_id = null where learner_user_id = ?',
            {
                replacements: [numericUserId],
                transaction,
            },
        );

        // Email challenges are keyed by normalized address instead of user_id
        // so they can exist before registration. Remove them with the account.
        await sequelize.query('delete from user_email_challenges where email = ?', {
            replacements: [String(row.email).toLowerCase()],
            transaction,
        });

        await sequelize.query('delete from users where id = ?', {
            replacements: [numericUserId],
            transaction,
        });
    });

    return {
        success: true,
        message: 'success',
        data: { deleted: true },
    };
}
