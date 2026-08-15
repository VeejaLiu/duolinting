import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../env';
import { UserSessionModel, type AuthClientType } from '../../models/schema/UserSessionDB';
import { signToken, TOKEN_EXPIRES_IN_SECONDS } from '../../lib/token/signToken';
import { recordUserDailyAccess } from './user-access-activity-service';

export { type AuthClientType };

export const AUTH_CLIENT_TYPES: AuthClientType[] = ['web_app', 'mobile_web', 'mobile_app'];
export const DEFAULT_AUTH_CLIENT_TYPE: AuthClientType = 'web_app';

export const inferAuthClientTypeFromRequest = ({
    origin,
    userAgent,
}: {
    origin?: string | string[];
    userAgent?: string | string[];
}): AuthClientType => {
    const normalizedOrigin = Array.isArray(origin) ? origin[0] : origin;
    const normalizedUserAgent = Array.isArray(userAgent) ? userAgent[0] : userAgent;

    if (typeof normalizedUserAgent === 'string' && /expo|react-native|okhttp|cfnetwork/i.test(normalizedUserAgent)) {
        return 'mobile_app';
    }

    if (typeof normalizedOrigin === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1):8081\b/.test(normalizedOrigin)) {
        return 'mobile_web';
    }

    if (typeof normalizedUserAgent === 'string' && /android|iphone|ipad|ipod|mobile/i.test(normalizedUserAgent)) {
        return 'mobile_web';
    }

    return DEFAULT_AUTH_CLIENT_TYPE;
};

type SessionTokenPayload = {
    id: string | number;
    sessionId?: string | number;
    clientType?: string;
    exp?: number;
};

type VerifyUserSessionResult = { success: true; userId: number } | { success: false };

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const normalizeAuthClientType = (value: unknown): AuthClientType => {
    return AUTH_CLIENT_TYPES.includes(value as AuthClientType) ? (value as AuthClientType) : DEFAULT_AUTH_CLIENT_TYPE;
};

const createExpiryDate = () => new Date(Date.now() + TOKEN_EXPIRES_IN_SECONDS * 1000);

export async function issueUserSession({ userId, clientType }: { userId: string | number; clientType: AuthClientType }) {
    /*
     * Session model:
     * - clientType is the product surface that owns the session: web_app, mobile_web, or mobile_app.
     * - One user keeps one active session per clientType, so logging in on mobile_app replaces only
     *   the mobile_app token and does not invalidate web_app or mobile_web.
     * - The JWT carries sessionId so verification can target the exact row instead of comparing
     *   against users.token, which was a single shared slot and caused cross-device logout.
     */
    const userSessionId = Number(userId);
    const existingSession = await UserSessionModel.findOne({
        where: {
            user_id: userSessionId,
            client_type: clientType,
        },
    });
    const session =
        existingSession ??
        (await UserSessionModel.create({
            user_id: userSessionId,
            client_type: clientType,
            token_hash: '',
            expires_at: createExpiryDate(),
            last_seen_at: new Date(),
        } as any));

    const token = signToken(userId, {
        sessionId: session.id,
        clientType,
    });

    await UserSessionModel.update(
        {
            token_hash: hashToken(token),
            expires_at: createExpiryDate(),
            revoked_at: null,
            last_seen_at: new Date(),
        },
        { where: { id: session.id } },
    );
    await recordUserDailyAccess(userSessionId, clientType);

    return token;
}

/**
 * 密码更新后撤销用户在所有端的旧会话。调用方随后会为本次请求所属端重新签发 token，
 * 因此当前设备能无感继续使用，其他设备则必须用新密码重新认证。
 */
export async function revokeAllUserSessions(userId: string | number) {
    await UserSessionModel.update(
        {
            revoked_at: new Date(),
        },
        {
            where: { user_id: Number(userId) },
        },
    );
}

export async function verifyUserSession(token: string): Promise<VerifyUserSessionResult> {
    const decoded = jwt.verify(token, env.secret.jwt) as SessionTokenPayload;
    const userId = Number(decoded.id);
    const sessionId = Number(decoded.sessionId);
    const clientType = normalizeAuthClientType(decoded.clientType);

    if (!userId || !sessionId) {
        return { success: false };
    }

    const session = await UserSessionModel.findOne({
        where: {
            id: sessionId,
            user_id: userId,
            client_type: clientType,
        },
        raw: true,
    });

    if (!session || session.revoked_at || session.token_hash !== hashToken(token)) {
        return { success: false };
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
        return { success: false };
    }

    await UserSessionModel.update({ last_seen_at: new Date() }, { where: { id: sessionId } });
    await recordUserDailyAccess(userId, clientType);

    return { success: true, userId };
}
