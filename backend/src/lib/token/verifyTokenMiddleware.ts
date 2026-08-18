import jwt from 'jsonwebtoken';
import { env } from '../../env';
import { verifyUserSession } from '../../general/user/user-session-service';
import { Logger } from '../logger';

const JWT_SECRET = env.secret.jwt;
const logger = new Logger(__filename);

export async function verifyToken(token: string): Promise<{ success: boolean; data?: { id: number } }> {
    try {
        const result = await verifyUserSession(token);
        return result.success && result.userId ? { success: true, data: { id: result.userId } } : { success: false };
    } catch (e) {
        logger.error(`[verifyToken] ERROR: ${e}`);
        return { success: false };
    }
}

export function verifyTokenMiddleware(req: any, res: any, next: any) {
    const token = req.headers.token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
        req.user = undefined;
        return res.status(401).send({ success: false, message: 'Missing token' });
    }

    jwt.verify(token, JWT_SECRET, async function (err: any) {
        if (err) {
            logger.error(`[verifyTokenMiddleware] verify error: ${err}`);
            req.user = undefined;
            return res.status(401).send({ success: false, message: 'Token is not valid' });
        }

        /*
         * JWT validation confirms the token was issued by us. The session lookup
         * below confirms it is still the active token for its exact surface:
         * web_app, mobile_web, or mobile_app. That replaces the old users.token
         * single-slot check, which made every new login invalidate every other surface.
         */
        const result = await verifyUserSession(token).catch((error) => {
            logger.error(`[verifyTokenMiddleware] session error: ${error}`);
            return { success: false } as const;
        });
        if (!result.success || !result.userId) {
            req.user = undefined;
            return res.status(401).send({ success: false, message: 'Token is not valid' });
        }

        req.user = { userId: result.userId };
        next();
    });
}

/** Public catalog routes use this to reveal previews only to a valid volunteer session. */
export async function optionalUserTokenMiddleware(req: any, _res: any, next: any) {
    const token = req.headers.token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
        req.user = undefined;
        return next();
    }
    const result = await verifyUserSession(token).catch(() => ({ success: false } as const));
    req.user = result.success && result.userId ? { userId: result.userId } : undefined;
    next();
}
