import express from 'express';
import userRouter from './user';
import oauthRouter from './oauth';

const router = express.Router();

router.use('/', userRouter);
router.use('/oauth', oauthRouter);

export default router;
