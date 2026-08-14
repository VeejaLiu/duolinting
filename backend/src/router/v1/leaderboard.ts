import express from 'express';
import { getLeaderboard } from '../../general/leaderboard/leaderboard-service';
import { verifyTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';

const router = express.Router();

// 排行榜需要登录：榜单中会标记"当前用户"并返回其名次
router.get('/', verifyTokenMiddleware, async (req: any, res) => {
    const leaderboard = await getLeaderboard(req.user.userId);
    res.status(200).send(leaderboard);
});

export default router;
