import express from 'express';
import { body } from 'express-validator';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';
import { verifyTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';
import {
    getDailyActivitySummary,
    recordMasteredActivity,
} from '../../general/progress/daily-activity-service';

const router = express.Router();

router.get('/', verifyTokenMiddleware, async (req: any, res) => {
    res.status(200).send(await getDailyActivitySummary(req.user.userId));
});

router.post(
    '/mastered',
    verifyTokenMiddleware,
    body('day').isString().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('masteredDelta').optional().isInt({ min: 1, max: 100 }).toInt(),
    validateErrorCheck,
    async (req: any, res) => {
        await recordMasteredActivity(req.user.userId, req.body.day, req.body.masteredDelta ?? 1);
        res.status(200).send({ ok: true });
    },
);

export default router;
