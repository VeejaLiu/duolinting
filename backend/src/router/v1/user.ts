import express, { type Request } from 'express';
import { body } from 'express-validator';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';
import { verifyTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';
import {
    changeUserPassword,
    getUserInfo,
    loginUser,
    registerUser,
} from '../../general/user/user-service';
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

router.get('/preferences', verifyTokenMiddleware, async (req: any, res) => {
    res.status(200).send(await getUserPreferences(req.user.userId));
});

router.patch(
    '/preferences',
    verifyTokenMiddleware,
    body('uiLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP']),
    body('contentLocale').optional().isIn(['zh-CN', 'en-US', 'th-TH', 'ja-JP']),
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
    '/register',
    registrationRateLimit,
    body('email').isEmail().withMessage('Email must be a valid email'),
    body('displayName').isString().isLength({ min: 1 }).withMessage('Display name is required'),
    body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 chars'),
    validateErrorCheck,
    async (req, res) => {
        const result = await registerUser({
            ...req.body,
            clientType: getRequestClientType(req),
        });
        res.status(result.success ? 201 : 409).send(result);
    },
);

router.post(
    '/login',
    learnerLoginRateLimit,
    body('email').isEmail().withMessage('Email must be a valid email'),
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

export default router;
