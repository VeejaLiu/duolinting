import { createHash, randomUUID } from 'node:crypto';
import type { GeoContext } from '../analytics/geo';
import { rows, write, json, utcValue } from '../analytics/service';
import bcrypt from 'bcryptjs';
import { UniqueConstraintError } from 'sequelize';
import type { AuthUser, RegisterRequest, ResetPasswordRequest } from '../../domain';
import { sequelize } from '../../models/db-config-mysql';
import { UserModel } from '../../models/schema/UserDB';
import { UserSessionModel } from '../../models/schema/UserSessionDB';
import { consumeReauthTicket } from './user-reauth-service';
import { ReauthError } from './user-reauth-service';
import { revokeAppleGrant } from './user-oauth-service';
import { consumeUserEmailChallenge, EmailChallengeError } from './user-email-challenge-service';
import {
    issueUserSession,
    normalizeAuthClientType,
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

/**
 * Consume one email-login challenge and resolve the mailbox to exactly one
 * learner row. The challenge row is locked first, so concurrent submissions
 * cannot both issue sessions or create separate accounts for one code.
 */
export async function verifyEmailLogin({
    email, challengeId, code, clientType, geo, analyticsEpoch, retryOnCollision = true,
}: {
    email: string;
    challengeId: number;
    code: string;
    clientType?: unknown;
    geo?: GeoContext;
    analyticsEpoch?: string;
    retryOnCollision?: boolean;
}): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await sequelize.transaction(async (transaction) => {
        const challengeError = await consumeUserEmailChallenge({
            email: normalizedEmail, purpose: 'email_login', code, challengeId, transaction,
        });
        if (challengeError) return challengeError;

        let user = await UserModel.findOne({
            where: { email: normalizedEmail }, transaction, lock: transaction.LOCK.UPDATE,
        });
        if (!user) {
            user = await UserModel.create({
                email: normalizedEmail,
                display_name: 'Learner',
                password_hash: null,
                email_verified_at: new Date(),
            } as any, { transaction });
            await user.update({ display_name: `Learner ${user.id}` }, { transaction });
            await write('insert into analytics_user_profiles(user_id,registration_country) values(:id,:country)', {
                id: user.id, country: geo?.countryCode ?? 'unknown',
            }, transaction);
            // The email-first path is now the primary registration route. Keep
            // its conversion attribution identical to legacy /register.
            const context = analyticsEpoch && /^[a-f0-9]{64}$/.test(analyticsEpoch)
                ? (await rows('select * from analytics_sessions where identity_epoch=:epoch and user_id is null and revoked_at is null and expires_at>UTC_TIMESTAMP(3) for update', { epoch: createHash('sha256').update(analyticsEpoch).digest('hex') }, transaction))[0]
                : undefined;
            if (context && Date.now() - utcValue(context.last_activity_at) < 30 * 60_000) {
                const source = json<Record<string, string>>(context.attribution).utm_source ?? 'direct_or_unknown';
                await write('update analytics_user_profiles set registration_source=:source where user_id=:id', { source, id: user.id }, transaction);
                await write(`insert into analytics_events(event_id,event_name,user_id,anonymous_id,identity_epoch,analytics_session_id,seq,event_at,received_at,stat_date,client_type,surface,environment,country_code,geo_source,app_build,properties) values(:id,'signup_completed',:userId,:anon,:epoch,:session,0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),date(UTC_TIMESTAMP()+interval 8 hour),:client,'learner',:environment,:country,:source,'server','{}')`, { id: randomUUID(), userId: user.id, anon: context.anonymous_id, epoch: context.identity_epoch, session: context.analytics_session_id, client: context.client_type, environment: context.environment, country: geo?.countryCode ?? 'unknown', source: geo?.source ?? 'unknown' }, transaction);
            }
        } else if (!user.email_verified_at) {
            // An unverified legacy password may have been chosen by somebody
            // who did not own this mailbox. Claiming it invalidates that hash
            // and all pre-verification sessions while keeping learning data.
            await user.update({ email_verified_at: new Date(), password_hash: null }, { transaction });
            await UserSessionModel.update(
                { revoked_at: new Date() },
                { where: { user_id: user.id }, transaction },
            );
        }
        return user;
    }).catch((error) => {
        if (error instanceof UniqueConstraintError && retryOnCollision) {
            // The competing transaction won the email UNIQUE race. Our code
            // consumption rolled back, so retry against its committed user.
            return verifyEmailLogin({ email, challengeId, code, clientType, geo, analyticsEpoch, retryOnCollision: false });
        }
        throw error;
    });
    if ('success' in result) return result;
    if (result instanceof EmailChallengeError) throw result;
    const user = mapUser(result);
    const token = await issueUserSession({
        userId: user.id, clientType: normalizeAuthClientType(clientType), authMethod: 'email_code',
    });
    return { success: true, message: 'success', data: { user, token } };
}

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
      const verificationError = await consumeUserEmailChallenge({
          email: normalizedEmail,
          purpose: 'register',
          code: request.verificationCode,
          transaction,
        });
      // Commit failed-attempt counters before returning the error to the caller.
      if (verificationError) return verificationError;
      const account = await UserModel.create({
        email: normalizedEmail,
        display_name: request.displayName,
        password_hash: passwordHash,
        email_verified_at: new Date(),
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
    if (createdUser instanceof EmailChallengeError) throw createdUser;

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

    const resetError = await sequelize.transaction(async (transaction) => {
        const verificationError = await consumeUserEmailChallenge({
            email: normalizedEmail,
            purpose: 'password_reset',
            code: request.verificationCode,
            transaction,
        });
        if (verificationError) return verificationError;
        await UserModel.update(
            { password_hash: await bcrypt.hash(request.newPassword, 10), email_verified_at: new Date() },
            { where: { id: userRecord.id }, transaction },
        );
        await UserSessionModel.update(
            { revoked_at: new Date() },
            { where: { user_id: userRecord.id }, transaction },
        );
        return null;
    });
    if (resetError) throw resetError;

    return {
        success: true,
        message: 'success',
        data: { reset: true },
    };
}

export async function loginUser({
    email,
    password,
    verificationCode,
    clientType,
}: {
    email: string;
    password: string;
    verificationCode?: string;
    clientType?: unknown;
}): Promise<AuthResult> {
    const userRecord = await findUserByEmail(email);
    if (!userRecord) {
        return { success: false, message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' };
    }

    const passwordHash = plainUser(userRecord).password_hash;
    const matched = passwordHash ? await bcrypt.compare(password, passwordHash) : false;
    if (!matched) {
        return { success: false, message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' };
    }

    if (!plainUser(userRecord).email_verified_at) {
        if (!verificationCode) {
            return {
                success: false,
                message: 'Email verification is required.',
                code: 'EMAIL_VERIFICATION_REQUIRED',
            };
        }
        const verificationError = await sequelize.transaction(async (transaction) => {
            const lockedUser = await UserModel.findByPk(userRecord.id, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!lockedUser) {
                return new EmailChallengeError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
            }
            if (lockedUser.email_verified_at) return null;
            const codeError = await consumeUserEmailChallenge({
                email: email.trim().toLowerCase(),
                purpose: 'verify_account',
                code: verificationCode,
                transaction,
            });
            if (codeError) return codeError;
            await lockedUser.update({ email_verified_at: new Date() }, { transaction });
            // Tokens issued before ownership was proven must stay revoked even
            // after this account becomes verified on another device.
            await UserSessionModel.update(
                { revoked_at: new Date() },
                { where: { user_id: lockedUser.id }, transaction },
            );
            return null;
        });
        if (verificationError) throw verificationError;
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

export async function getUserAuthMethods(userId: number) {
    const user = await UserModel.findByPk(userId);
    if (!user) return null;
    const [rows] = await sequelize.query(
        'select provider, provider_email from user_auth_identities where user_id = ?',
        { replacements: [userId] },
    );
    const identities = rows as { provider: string; provider_email: string | null }[];
    const providers = new Set(identities.map((row) => row.provider));
    return {
        email: Boolean(user.email && user.email_verified_at),
        password: Boolean(user.password_hash && user.email && user.email_verified_at),
        apple: providers.has('apple'),
        google: providers.has('google'),
        providerEmails: {
            apple: identities.find((row) => row.provider === 'apple')?.provider_email ?? null,
            google: identities.find((row) => row.provider === 'google')?.provider_email ?? null,
        },
    };
}

/** Add an email login address only after proving both the current session and
 * control of the new mailbox. A matching address on another user is never merged. */
export async function linkUserEmail({ userId, sessionId, email, challengeId, code, reauthTicket }: {
    userId: number;
    sessionId: number;
    email: string;
    challengeId: number;
    code: string;
    reauthTicket: string;
}) {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await sequelize.transaction(async (transaction) => {
        const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) throw new ReauthError('USER_NOT_FOUND', 404);
        if (user.email && user.email !== normalizedEmail) throw new ReauthError('EMAIL_ALREADY_SET', 409);
        const existing = await UserModel.findOne({ where: { email: normalizedEmail }, transaction, lock: transaction.LOCK.UPDATE });
        if (existing && existing.id !== userId) throw new ReauthError('EMAIL_ALREADY_REGISTERED', 409);
        const codeError = await consumeUserEmailChallenge({ email: normalizedEmail, purpose: 'link_email', challengeId, code, transaction });
        if (codeError) return codeError;
        await consumeReauthTicket({ userId, sessionId, purpose: 'link_email', ticket: reauthTicket, transaction });
        await user.update({ email: normalizedEmail, email_verified_at: new Date() }, { transaction });
        return { email: normalizedEmail };
    }).catch((error) => {
        if (error instanceof UniqueConstraintError) throw new ReauthError('EMAIL_ALREADY_REGISTERED', 409);
        throw error;
    });
    if (result instanceof EmailChallengeError) throw result;
    return result;
}

/**
 * 修改密码必须先比对当前密码，再写入 bcrypt 哈希。成功后撤销全部旧会话，
 * 并给当前客户端签发新 token，避免旧密码泄露后已登录设备继续长期有效。
 */
export async function changeUserPassword({
    userId,
    currentPassword,
    reauthTicket,
    sessionId,
    newPassword,
    clientType,
}: {
    userId: string | number;
    currentPassword?: string;
    reauthTicket?: string;
    sessionId?: number;
    newPassword: string;
    clientType?: unknown;
}): Promise<AuthResult> {
    const userRecord = await UserModel.findOne({ where: { id: userId } });
    if (!userRecord) {
        return { success: false, message: 'User not found' };
    }

    const row = plainUser(userRecord);
    if (!row.email || !row.email_verified_at) {
        return { success: false, message: 'Set up email login before setting a password', code: 'EMAIL_LOGIN_REQUIRED' };
    }
    const passwordMatches = row.password_hash && currentPassword
        ? await bcrypt.compare(currentPassword, row.password_hash)
        : false;
    if (!passwordMatches && !reauthTicket) {
        return { success: false, message: 'Current password is incorrect' };
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await sequelize.transaction(async (transaction) => {
        if (reauthTicket) {
            if (!sessionId) throw new Error('Missing authenticated session');
            await consumeReauthTicket({ userId: Number(userId), sessionId, purpose: 'set_password', ticket: reauthTicket, transaction });
        }
        await UserModel.update({ password_hash: nextHash }, { where: { id: userId }, transaction });
        await UserSessionModel.update({ revoked_at: new Date() }, { where: { user_id: Number(userId) }, transaction });
    });

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
    reauthTicket,
    sessionId,
}: {
    userId: string | number;
    currentPassword?: string;
    reauthTicket?: string;
    sessionId?: number;
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
    const passwordMatches = row.password_hash && currentPassword
        ? await bcrypt.compare(currentPassword, row.password_hash)
        : false;
    if (!passwordMatches && !reauthTicket) {
        return { success: false, message: 'Current password is incorrect' };
    }

    await sequelize.transaction(async (transaction) => {
        if (reauthTicket) {
            if (!sessionId) throw new Error('Missing authenticated session');
            await consumeReauthTicket({ userId: numericUserId, sessionId, purpose: 'delete_account', ticket: reauthTicket, transaction });
        }
        await revokeAppleGrant(numericUserId);
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
            'user_auth_identities',
            'user_auth_grants',
            'user_reauth_tickets',
        ];

        for (const tableName of userOwnedTables) {
            await sequelize.query(`delete from ${tableName} where user_id = ?`, {
                replacements: [numericUserId],
                transaction,
            });
        }
        await sequelize.query('delete from auth_transactions where user_id = ? or result_user_id = ?', {
            replacements: [numericUserId, numericUserId], transaction,
        });

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
        if (row.email) await sequelize.query('delete from user_email_challenges where email = ?', {
            replacements: [String(row.email).toLowerCase()], transaction,
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
