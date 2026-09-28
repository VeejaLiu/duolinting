import express, { type Request, type Response } from 'express';
import { body } from 'express-validator';
import { env } from '../../env';
import { resolveRequestGeoContext } from '../../general/analytics/geo';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';
import { verifyTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';
import { createRateLimit } from '../../lib/rate-limit';
import { inferAuthClientTypeFromRequest, verifyUserSession } from '../../general/user/user-session-service';
import { ReauthError } from '../../general/user/user-reauth-service';
import { AuthTransactionModel } from '../../models/schema/AuthTransactionDB';
import {
    completeOAuth, confirmOAuthLink, createOAuthExchange, exchangeOAuthResult,
    findAppleCallbackTransaction, oauthAvailability, OAuthError, startOAuth,
    unlinkOAuthIdentity,
} from '../../general/user/user-oauth-service';

const router = express.Router();
const oauthLimiter = createRateLimit({ namespace: 'learner-oauth', windowMs: 15 * 60 * 1000, maxAttempts: 20, keys: (req) => [`ip:${req.ip}`], resetOnSuccess: false });
const sendError = (res: Response, error: unknown) => {
    if (error instanceof OAuthError) { res.status(error.status).send({ success: false, code: error.code, message: error.code }); return true; }
    if (error instanceof ReauthError) { res.status(error.status).send({ success: false, code: error.code, message: error.code }); return true; }
    return false;
};
const sessionFromRequest = async (req: Request) => {
    const token = req.headers.token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (typeof token !== 'string') return null;
    const result = await verifyUserSession(token).catch(() => ({ success: false } as const));
    return result.success ? result : null;
};
const clientTypeFromRequest = (req: Request) => req.body.clientType ?? req.headers['x-duolinting-client-type'] ?? inferAuthClientTypeFromRequest({ origin: req.headers.origin, userAgent: req.headers['user-agent'] });

router.get('/config', (_req, res) => {
    const enabled = oauthAvailability();
    res.status(200).send({ success: true, data: {
        enabled,
        googleWebClientId: enabled.googleWeb ? env.oauth.googleWebClientId : null,
        googleIosClientId: enabled.googleIos ? env.oauth.googleIosClientId : null,
        appleCallbackOrigin: enabled.appleWeb ? new URL(env.oauth.appleRedirectUri).origin : null,
    } });
});

router.post('/start', oauthLimiter,
    body('provider').isIn(['apple', 'google']),
    body('purpose').isIn(['login', 'link', 'reauth']),
    body('platform').isIn(['ios', 'android', 'web']),
    body('reauthPurpose').optional().isIn(['delete_account', 'set_password', 'unlink_identity', 'link_email']),
    body('verifier').optional().isString().isLength({ min: 32, max: 128 }),
    body('returnOrigin').optional().isURL({ protocols: ['https', 'http'], require_protocol: true }),
    validateErrorCheck,
    async (req, res, next) => {
        try {
            const session = req.body.purpose === 'login' ? null : await sessionFromRequest(req);
            if (req.body.purpose !== 'login' && !session) return res.status(401).send({ success: false, code: 'AUTH_REQUIRED' });
            const data = await startOAuth({
                provider: req.body.provider, purpose: req.body.purpose, platform: req.body.platform,
                clientType: clientTypeFromRequest(req), reauthPurpose: req.body.reauthPurpose,
                userId: session?.userId, sessionId: session?.sessionId, verifier: req.body.verifier,
                returnOrigin: req.body.returnOrigin,
                analyticsEpoch: req.get('x-analytics-context'),
                geo: resolveRequestGeoContext(req),
            });
            res.status(200).send({ success: true, data });
        } catch (error) { if (!sendError(res, error)) next(error); }
    });

router.post('/complete', oauthLimiter,
    body('transactionId').isInt({ min: 1 }).toInt(),
    body('idToken').optional().isString().isLength({ min: 20 }),
    body('authorizationCode').optional().isString().isLength({ min: 8 }),
    validateErrorCheck,
    async (req, res, next) => {
        try {
            const session = await sessionFromRequest(req);
            const data = await completeOAuth({ transactionId: req.body.transactionId, idToken: req.body.idToken ?? '', authorizationCode: req.body.authorizationCode, userId: session?.userId, sessionId: session?.sessionId });
            res.status(200).send({ success: true, data });
        } catch (error) { if (!sendError(res, error)) next(error); }
    });

router.post('/link/confirm', verifyTokenMiddleware, oauthLimiter,
    body('transactionId').isInt({ min: 1 }).toInt(),
    body('confirmed').equals('true'),
    validateErrorCheck,
    async (req: any, res, next) => {
        try { res.status(200).send({ success: true, data: await confirmOAuthLink(req.body.transactionId, req.user.userId) }); }
        catch (error) { if (!sendError(res, error)) next(error); }
    });

router.post('/unlink', verifyTokenMiddleware, oauthLimiter,
    body('provider').isIn(['apple', 'google']),
    body('reauthTicket').isString().isLength({ min: 64, max: 64 }),
    validateErrorCheck,
    async (req: any, res, next) => {
        try { res.status(200).send({ success: true, data: await unlinkOAuthIdentity(req.user.userId, req.user.sessionId, req.body.provider, req.body.reauthTicket) }); }
        catch (error) { if (!sendError(res, error)) next(error); }
    });

router.post('/apple/callback', async (req, res, next) => {
    try {
        const state = String(req.body.state ?? '');
        const tx = await findAppleCallbackTransaction(state);
        if (req.body.error) {
            await AuthTransactionModel.update({ consumed_at: new Date() }, { where: { id: tx.id, consumed_at: null } });
            if (tx.platform === 'android') return res.redirect(303, 'duolinting://oauth?cancelled=1');
            const origin = tx.return_origin;
            if (!origin || !env.oauth.webOrigins.includes(origin)) throw new OAuthError('OAUTH_RETURN_INVALID', 401);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'nonce-oauth-return'; base-uri 'none'");
            return res.status(200).type('html').send(`<!doctype html><meta charset="utf-8"><title>DuolinTing</title><script nonce="oauth-return">window.opener?.postMessage({type:'duolinting-oauth',cancelled:true},${JSON.stringify(origin)});window.close();</script>`);
        }
        await completeOAuth({ transactionId: tx.id, idToken: String(req.body.id_token ?? ''), authorizationCode: String(req.body.code ?? ''), deferSession: true });
        const ticket = await createOAuthExchange(tx.id);
        if (tx.platform === 'android') {
            return res.redirect(303, `duolinting://oauth?ticket=${encodeURIComponent(ticket)}`);
        }
        const origin = tx.return_origin;
        if (!origin || !env.oauth.webOrigins.includes(origin)) throw new OAuthError('OAUTH_RETURN_INVALID', 401);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-oauth-return'; base-uri 'none'`);
        return res.status(200).type('html').send(`<!doctype html><meta charset="utf-8"><title>DuolinTing</title><script nonce="oauth-return">window.opener?.postMessage({type:'duolinting-oauth',ticket:${JSON.stringify(ticket)}},${JSON.stringify(origin)});window.close();</script><p>You can return to DuolinTing.</p>`);
    } catch (error) { if (!sendError(res, error)) next(error); }
});

router.post('/exchange', oauthLimiter,
    body('ticket').isString().isLength({ min: 20 }),
    body('verifier').isString().isLength({ min: 32 }),
    validateErrorCheck,
    async (req, res, next) => {
        try {
            const session = await sessionFromRequest(req);
            const data = await exchangeOAuthResult(req.body.ticket, req.body.verifier, session?.userId, session?.sessionId);
            res.status(200).send({ success: true, data });
        } catch (error) { if (!sendError(res, error)) next(error); }
    });

export default router;
