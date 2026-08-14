import express from 'express';
import userRouter from './user';

const router = express.Router();

router.use('/', userRouter);

export default router;
