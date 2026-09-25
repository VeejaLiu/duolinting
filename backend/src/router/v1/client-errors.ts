import express from 'express';
import { body } from 'express-validator';
import { Logger } from '../../lib/logger';
import { createRateLimit } from '../../lib/rate-limit';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';

const router = express.Router();
const logger = new Logger(__filename);
const limitReports = createRateLimit({
    namespace: 'client-runtime-errors',
    windowMs: 60_000,
    maxAttempts: 20,
    keys: (req) => [`ip:${req.ip ?? '-'}`],
    resetOnSuccess: false,
});

// The endpoint is available before sign-in. Keep the payload bounded and remove
// common personal data and URL query strings before writing an operational log.
const scrub = (value: string, maxLength: number) => value
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/\b(password|token|secret|api[_-]?key|code)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
        try {
            const url = new URL(match);
            return `${url.origin}${url.pathname}`;
        } catch {
            return '[url]';
        }
    })
    .replace(/file:\/\/[^\s"'<>]+/gi, '[file]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[value]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, maxLength);

router.post('/',
    limitReports,
    body('source').isString().trim().isLength({ min: 1, max: 64 }),
    body('name').isString().trim().isLength({ min: 1, max: 80 }),
    body('message').isString().trim().isLength({ min: 1, max: 600 }),
    body('stack').optional({ nullable: true }).isString().isLength({ max: 4000 }),
    body('platform').isIn(['web', 'ios', 'android']),
    body('route').optional({ nullable: true }).isIn(['', '/', '/settings', '/study', '/series', '/auth', '/contribute', '/vocabulary', '/other']),
    validateErrorCheck,
    (req, res) => {
        const report = {
            requestId: String(res.locals.requestId ?? '-'),
            source: scrub(req.body.source, 64),
            name: scrub(req.body.name, 80),
            message: scrub(req.body.message, 600),
            stack: scrub(req.body.stack ?? '', 4000),
            platform: req.body.platform,
            route: scrub(req.body.route ?? '', 256),
        };
        logger.error(`[client-runtime] ${JSON.stringify(report)}`);
        res.set('Cache-Control', 'no-store');
        res.status(202).send({ ok: true });
    },
);

export default router;
