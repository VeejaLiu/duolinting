import { resolveRequestGeoContext } from '../../general/analytics/geo';
import express, { type Request, type Response } from 'express';
import { body } from 'express-validator';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';
import { verifyTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';
import {
    changeUserPassword,
    deleteUserAccount,
    getUserInfo,
    loginUser,
    registerUser,
    resetUserPassword,
} from '../../general/user/user-service';
import {
    EmailChallengeError,
    EMAIL_CODE_HOURLY_LIMIT,
    requestUserEmailChallenge,
} from '../../general/user/user-email-challenge-service';
import { inferAuthClientTypeFromRequest } from '../../general/user/user-session-service';
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
    maxAttempts: EMAIL_CODE_HOURLY_LIMIT,
    keys: authenticationRateLimitKeys('email'),
    // A successful send still consumes quota; otherwise attackers could issue
    // unlimited paid email requests because the generic auth limiter resets.
    resetOnSuccess: false,
});
const passwordResetRateLimit = createRateLimit({
    namespace: 'learner-password-reset',
    windowMs: 60 * 60 * 1000,
    maxAttempts: 10,
    keys: authenticationRateLimitKeys('email'),
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
    '/email-code',
    emailCodeRateLimit,
    body('email').trim().toLowerCase().isEmail().withMessage('Email must be a valid email'),
    body('purpose').isIn(['register', 'password_reset']).withMessage('Invalid email code purpose'),
    body('uiLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']),
    validateErrorCheck,
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
    validateErrorCheck,
    async (req, res) => {
        const result = await loginUser({
            ...req.body,
            clientType: getRequestClientType(req),
        });
        res.status(result.success ? 200 : 401).send(result);
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
    body('currentPassword').isString().withMessage('Current password must be a string'),
    body('newPassword').isString().isLength({ min: 8 }).withMessage('New password must be at least 8 chars'),
    validateErrorCheck,
    async (req: any, res) => {
        const result = await changeUserPassword({
            userId: req.user.userId,
            currentPassword: req.body.currentPassword,
            newPassword: req.body.newPassword,
            clientType: getRequestClientType(req),
        });
        res.status(result.success ? 200 : 400).send(result);
    },
);

router.delete(
    '/account',
    verifyTokenMiddleware,
    body('currentPassword').isString().isLength({ min: 1 }).withMessage('Current password is required'),
    validateErrorCheck,
    async (req: any, res) => {
        const result = await deleteUserAccount({
            userId: req.user.userId,
            currentPassword: req.body.currentPassword,
        });
        res.status(result.success ? 200 : 400).send(result);
    },
);

export default router;
