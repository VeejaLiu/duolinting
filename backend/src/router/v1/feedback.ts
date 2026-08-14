import express from 'express';
import { body } from 'express-validator';
import { verifyTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';
import { submitAcceptedAnswerFeedback } from '../../general/feedback/feedback-service';

const router = express.Router();

router.post(
    '/accepted-answer',
    verifyTokenMiddleware,
    body('exerciseId').isInt({ min: 1 }),
    body('lineId').isString().isLength({ min: 1 }),
    body('submittedAnswer').isString().isLength({ min: 1 }),
    validateErrorCheck,
    async (req: any, res) => {
        const result = await submitAcceptedAnswerFeedback(req.user.userId, req.body);
        res.status(201).send(result);
    },
);

export default router;
