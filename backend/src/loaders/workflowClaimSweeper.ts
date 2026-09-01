import { Logger } from '../lib/logger';
import {
    expireOverdueClaims,
    notifyExpiringClaims,
} from '../general/admin/collaboration-service';

const logger = new Logger(__filename);

/**
 * 低频清扫器：释放所有来源的过期任务，并在到期前提醒。
 * 它只负责“发通知 + 写审计事件”这类有副作用且不需要实时一致的动作；
 * 真正的权限判定在查询/领取侧是惰性的，因此即使清扫器短暂停摆，
 * 过期的锁也不会被误当作仍然有效。
 */
export function startWorkflowClaimSweeper(intervalMs = 10 * 60 * 1000) {
    const runOnce = async () => {
        try {
            const now = new Date();
            await notifyExpiringClaims(now);
            const expired = await expireOverdueClaims();
            if (expired.length > 0) {
                logger.info(`[workflow-claim] 已释放 ${expired.length} 门超时未提交的课程`);
            }
        } catch (error) {
            logger.error(`[workflow-claim] 清扫器执行失败 ${error}`);
        }
    };

    // 启动后先跑一次，把停机期间过期的任务补回来。
    void runOnce();
    const timer = setInterval(() => {
        void runOnce();
    }, intervalMs);
    timer.unref?.();
    return timer;
}
