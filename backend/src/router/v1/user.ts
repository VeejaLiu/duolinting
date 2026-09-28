import { resolveRequestGeoContext } from '../../general/analytics/geo';
import express, { type Request, type Response } from 'express';
import { body } from 'express-validator';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';
import { verifyTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';
import {
    changeUserPassword,
    deleteUserAccount,
    getUserInfo,
    getUserAuthMethods,
    loginUser,
    linkUserEmail,
    registerUser,
    resetUserPassword,
    verifyEmailLogin,
} from '../../general/user/user-service';
import {
    EmailChallengeError,
    EMAIL_CODE_HOURLY_LIMIT,
    requestUserEmailChallenge,
} from '../../general/user/user-email-challenge-service';
import { inferAuthClientTypeFromRequest } from '../../general/user/user-session-service';
import { issueReauthTicket, reauthChallengePurpose, ReauthError } from '../../general/user/user-reauth-service';
import { UserModel } from '../../models/schema/UserDB';
import { UserSessionModel } from '../../models/schema/UserSessionDB';
import { confirmOAuthLink, OAuthError } from '../../general/user/user-oauth-service';
import { getUserPreferences, updateUserPreferences } from '../../general/user/user-preference-service';
import { authenticationRateLimitKeys, createRateLimit } from '../../lib/rate-limit';

const router = express.Router();
const learnerLoginRateLimit = createRateLimit({
    namespace: 'learner-login',
    windowMs: 15 * 60 * 1000,
    maxAttempts: 10,
    keys: authenticationRateLimitKeys('email'),
});
const registrationRateLimit = createRateLimit({
    namespace: 'learner-register',
    windowMs: 60 * 60 * 1000,
    maxAttempts: 10,
    keys: authenticationRateLimitKeys('email'),
});
const emailCodeRateLimit = createRateLimit({
    namespace: 'learner-email-code',
    windowMs: 60 * 60 * 1000,
    // A cooldown check is not a sent email; the durable six-delivery quota is
    // enforced inside the challenge service across all purposes.
    maxAttempts: 30,
    keys: authenticationRateLimitKeys('email'),
    // A successful send still consumes quota; otherwise attackers could issue
    // unlimited paid email requests because the generic auth limiter resets.
    resetOnSuccess: false,
});
const globalEmailCodeRateLimit = createRateLimit({
    namespace: 'learner-email-global',
    windowMs: 60 * 60 * 1000,
    maxAttempts: 600,
    keys: () => ['global'],
    resetOnSuccess: false,
});
const passwordResetRateLimit = createRateLimit({
    namespace: 'learner-password-reset',
    windowMs: 60 * 60 * 1000,
    maxAttempts: 10,
    keys: authenticationRateLimitKeys('email'),
});
const reauthRateLimit = createRateLimit({
    namespace: 'learner-reauth',
    windowMs: 15 * 60 * 1000,
    maxAttempts: 10,
    keys: (req: any) => [`ip:${req.ip}`, `user:${req.user.userId}`],
});

const sendEmailChallengeError = (res: Response, error: unknown) => {
    if (error instanceof EmailChallengeError) {
        res.status(error.status).send({ success: false, message: error.message, code: error.code });
        return true;
    }
    return false;
};

router.get('/preferences', verifyTokenMiddleware, async (req: any, res) => {
    res.status(200).send(await getUserPreferences(req.user.userId));
});

router.patch(
    '/preferences',
    verifyTokenMiddleware,
    body('uiLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']),
    body('contentLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']),
    body('dailyGoal').optional().isInt({ min: 1, max: 1000 }).toInt(),
    validateErrorCheck,
    async (req: any, res) => {
        res.status(200).send(await updateUserPreferences(req.user.userId, req.body));
    },
);

const getRequestClientType = (req: Request) => {
    /*
     * clientType identifies the product surface that owns the login session.
     * We accept it in the request body for normal JSON clients and also as a
     * header so shared client wrappers can keep the session surface explicit.
     */
    return (
        req.body.clientType ??
        req.headers['x-duolinting-client-type'] ??
        inferAuthClientTypeFromRequest({
            origin: req.headers.origin,
            userAgent: req.headers['user-agent'],
        })
    );
};

router.post(
    '/email/link/start',
    verifyTokenMiddleware,
    body('email').trim().toLowerCase().isEmail(),
    body('uiLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']),
    validateErrorCheck,
    globalEmailCodeRateLimit,
    emailCodeRateLimit,
    async (req, res, next) => {
        try {
            const data = await requestUserEmailChallenge({ email: req.body.email, purpose: 'link_email', uiLocale: req.body.uiLocale });
            res.status(200).send({ success: true, data });
        } catch (error) { if (!sendEmailChallengeError(res, error)) next(error); }
    },
);

router.post(
    '/email/link/confirm',
    verifyTokenMiddleware,
    learnerLoginRateLimit,
    body('email').trim().toLowerCase().isEmail(),
    body('challengeId').isInt({ min: 1 }).toInt(),
    body('code').isString().matches(/^\d{6}$/),
    body('reauthTicket').isString().isLength({ min: 64, max: 64 }),
    validateErrorCheck,
    async (req: any, res, next) => {
        try {
            const data = await linkUserEmail({ userId: req.user.userId, sessionId: req.user.sessionId, ...req.body });
            res.status(200).send({ success: true, data });
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            if (error instanceof ReauthError) return res.status(error.status).send({ success: false, code: error.code });
            next(error);
        }
    },
);

router.post(
    '/email/start',
    body('email').trim().toLowerCase().isEmail().withMessage('Email must be a valid email'),
    body('uiLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']),
    validateErrorCheck,
    globalEmailCodeRateLimit,
    emailCodeRateLimit,
    async (req, res, next) => {
        try {
            const data = await requestUserEmailChallenge({
                email: req.body.email, purpose: 'email_login', uiLocale: req.body.uiLocale,
            });
            res.status(200).send({ success: true, message: 'success', data });
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            next(error);
        }
    },
);

router.post(
    '/email/verify',
    learnerLoginRateLimit,
    body('email').trim().toLowerCase().isEmail().withMessage('Email must be a valid email'),
    body('challengeId').isInt({ min: 1 }).toInt(),
    body('code').isString().matches(/^\d{6}$/),
    validateErrorCheck,
    async (req, res, next) => {
        try {
            const result = await verifyEmailLogin({
                email: req.body.email,
                challengeId: req.body.challengeId,
                code: req.body.code,
                clientType: getRequestClientType(req),
                geo: resolveRequestGeoContext(req),
                analyticsEpoch: req.get('x-analytics-context'),
            });
            res.status(200).send(result);
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            next(error);
        }
    },
);

router.post(
    '/password/login',
    learnerLoginRateLimit,
    body('email').trim().toLowerCase().isEmail(),
    body('password').isString(),
    validateErrorCheck,
    async (req, res, next) => {
        try {
            const result = await loginUser({ ...req.body, clientType: getRequestClientType(req) });
            res.status(result.success ? 200 : 401).send(result);
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            next(error);
        }
    },
);

router.post(
    '/email-code',
    body('email').trim().toLowerCase().isEmail().withMessage('Email must be a valid email'),
    body('purpose').isIn(['register', 'password_reset', 'verify_account']).withMessage('Invalid email code purpose'),
    body('password').optional().isString().isLength({ min: 1 }),
    body('uiLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']),
    validateErrorCheck,
    globalEmailCodeRateLimit,
    emailCodeRateLimit,
    async (req, res, next) => {
        try {
            const data = await requestUserEmailChallenge(req.body);
            res.status(200).send({ success: true, message: 'success', data });
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            next(error);
        }
    },
);

router.post(
    '/register',
    registrationRateLimit,
    body('email').trim().toLowerCase().isEmail().withMessage('Email must be a valid email'),
    body('displayName').isString().isLength({ min: 1 }).withMessage('Display name is required'),
    body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 chars'),
    body('verificationCode').optional().isString().matches(/^\d{6}$/).withMessage('Email code must contain six digits'),
    validateErrorCheck,
    async (req, res) => {
        try {
            const result = await registerUser({
                ...req.body,
                clientType: getRequestClientType(req),
            }, resolveRequestGeoContext(req), req.get('x-analytics-context'));
            res.status(result.success ? 201 : 409).send(result);
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            throw error;
        }
    },
);

router.post(
    '/login',
    learnerLoginRateLimit,
    body('email').trim().toLowerCase().isEmail().withMessage('Email must be a valid email'),
    body('password').isString().withMessage('Password must be a string'),
    body('verificationCode').optional().isString().matches(/^\d{6}$/),
    validateErrorCheck,
    async (req, res) => {
        try {
            const result = await loginUser({
                ...req.body,
                clientType: getRequestClientType(req),
            });
            res.status(result.success ? 200 : result.code === 'EMAIL_VERIFICATION_REQUIRED' ? 403 : 401).send(result);
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            throw error;
        }
    },
);

router.post(
    '/password-reset',
    passwordResetRateLimit,
    body('email').trim().toLowerCase().isEmail().withMessage('Email must be a valid email'),
    body('verificationCode').isString().matches(/^\d{6}$/).withMessage('Email code must contain six digits'),
    body('newPassword').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 chars'),
    validateErrorCheck,
    async (req, res) => {
        try {
            const result = await resetUserPassword(req.body);
            res.status(result.success ? 200 : 400).send(result);
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            throw error;
        }
    },
);

router.get('/info', verifyTokenMiddleware, async (req: any, res) => {
    const result = await getUserInfo({ userId: req.user.userId });
    res.status(result.success ? 200 : 404).send(result);
});

router.get('/methods', verifyTokenMiddleware, async (req: any, res) => {
    const methods = await getUserAuthMethods(req.user.userId);
    res.status(methods ? 200 : 404).send({ success: Boolean(methods), data: methods });
});

router.post('/logout', verifyTokenMiddleware, async (req: any, res) => {
    // Logging out ends only the exact verified client session. Other devices
    // and login identities remain linked to the learner account.
    await UserSessionModel.update({ revoked_at: new Date() }, {
        where: { id: req.user.sessionId, user_id: req.user.userId },
    });
    res.status(200).send({ success: true, data: { loggedOut: true } });
});

router.post(
    '/link/confirm',
    verifyTokenMiddleware,
    learnerLoginRateLimit,
    body('transactionId').isInt({ min: 1 }).toInt(),
    body('confirmed').equals('true'),
    validateErrorCheck,
    async (req: any, res, next) => {
        try {
            res.status(200).send({ success: true, data: await confirmOAuthLink(req.body.transactionId, req.user.userId) });
        } catch (error) {
            if (error instanceof OAuthError) return res.status(error.status).send({ success: false, code: error.code });
            next(error);
        }
    },
);

router.post(
    '/reauth/email/start',
    verifyTokenMiddleware,
    async (req: any, res, next) => {
        const user = await UserModel.findByPk(req.user.userId);
        if (!user?.email || !user.email_verified_at) return res.status(400).send({ success: false, code: 'EMAIL_AUTH_UNAVAILABLE' });
        // Reuse the same address bucket as ordinary email login and legacy
        // codes; the client cannot select a different address to evade quota.
        req.body.email = user.email;
        next();
    },
    body('purpose').isIn(['delete_account', 'set_password', 'unlink_identity', 'link_email']),
    body('uiLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']),
    validateErrorCheck,
    globalEmailCodeRateLimit,
    emailCodeRateLimit,
    async (req: any, res, next) => {
        try {
            const data = await requestUserEmailChallenge({
                email: req.body.email,
                purpose: reauthChallengePurpose(req.body.purpose),
                uiLocale: req.body.uiLocale,
            });
            res.status(200).send({ success: true, data });
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            next(error);
        }
    },
);

router.post(
    '/reauth',
    verifyTokenMiddleware,
    reauthRateLimit,
    body('purpose').isIn(['delete_account', 'set_password', 'unlink_identity', 'link_email']),
    body('method').isIn(['password', 'email_code']),
    body('password').optional().isString(),
    body('challengeId').optional().isInt({ min: 1 }).toInt(),
    body('code').optional().isString().matches(/^\d{6}$/),
    validateErrorCheck,
    async (req: any, res, next) => {
        try {
            const data = await issueReauthTicket({
                userId: req.user.userId, sessionId: req.user.sessionId,
                purpose: req.body.purpose, method: req.body.method,
                password: req.body.password, challengeId: req.body.challengeId, code: req.body.code,
            });
            res.status(200).send({ success: true, data });
        } catch (error) {
            if (sendEmailChallengeError(res, error)) return;
            if (error instanceof ReauthError) return res.status(error.status).send({ success: false, code: error.code });
            next(error);
        }
    },
);

router.get('/me', verifyTokenMiddleware, async (req: any, res) => {
    const result = await getUserInfo({ userId: req.user.userId });
    if (!result.success) {
        return res.status(404).send(result);
    }
    res.status(200).send(result.data);
});

router.put(
    '/password',
    verifyTokenMiddleware,
    body('currentPassword').optional().isString().withMessage('Current password must be a string'),
    body('reauthTicket').optional().isString(),
    body('newPassword').isString().isLength({ min: 8 }).withMessage('New password must be at least 8 chars'),
    validateErrorCheck,
    async (req: any, res) => {
        try {
            const result = await changeUserPassword({
                userId: req.user.userId,
                currentPassword: req.body.currentPassword,
                reauthTicket: req.body.reauthTicket,
                sessionId: req.user.sessionId,
                newPassword: req.body.newPassword,
                clientType: getRequestClientType(req),
            });
            res.status(result.success ? 200 : 400).send(result);
        } catch (error) {
            if (error instanceof ReauthError) return res.status(error.status).send({ success: false, code: error.code });
            throw error;
        }
    },
);

router.delete(
    '/account',
    verifyTokenMiddleware,
    body('currentPassword').optional().isString().isLength({ min: 1 }),
    body('reauthTicket').optional().isString(),
    validateErrorCheck,
    async (req: any, res) => {
        try {
            const result = await deleteUserAccount({
                userId: req.user.userId,
                currentPassword: req.body.currentPassword,
                reauthTicket: req.body.reauthTicket,
                sessionId: req.user.sessionId,
            });
            res.status(result.success ? 200 : 400).send(result);
        } catch (error) {
            if (error instanceof ReauthError) return res.status(error.status).send({ success: false, code: error.code });
            if (error instanceof OAuthError) return res.status(error.status).send({ success: false, code: error.code });
            throw error;
        }
    },
);

export default router;
