import express from 'express';
import adminRouter from './admin';
import authRouter from './auth';
import catalogRouter from './catalog';
import activityRouter from './activity';
import exercisesRouter from './exercises';
import feedbackRouter from './feedback';
import leaderboardRouter from './leaderboard';
import mediaRouter from './media';
import openContentRouter from './open-content';
import progressRouter from './progress';
import userRouter from './user';

const router = express.Router();

router.use('/catalog', catalogRouter);
router.use('/activity', activityRouter);
router.use('/exercises', exercisesRouter);
router.use('/user', userRouter);
router.use('/auth', authRouter);
router.use('/progress', progressRouter);
router.use('/feedback', feedbackRouter);
router.use('/leaderboard', leaderboardRouter);
router.use('/admin', adminRouter);
router.use('/open-content', openContentRouter);
router.use('/media', mediaRouter);

export default router;
