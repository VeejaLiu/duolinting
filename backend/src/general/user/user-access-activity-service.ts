import { sequelize } from '../../models/db-config-mysql';
import type { AuthClientType } from './user-session-service';

/**
 * 写入当天的端侧访问事实。
 *
 * activity_date 由 MySQL 的 CURDATE() 生成，和增长面板的 DAU/WAU/MAU 查询
 * 使用同一个服务器自然日口径。唯一键保证同一用户在同一端当天只计为一个活跃用户；
 * 重复请求仅刷新 last_seen_at，不会把一次会话放大成多次日活。
 */
export const recordUserDailyAccess = async (
    userId: number | string,
    clientType: AuthClientType,
): Promise<void> => {
    await sequelize.query(
        `insert into user_access_daily (user_id, client_type, activity_date, first_seen_at, last_seen_at)
         values (:userId, :clientType, curdate(), current_timestamp, current_timestamp)
         on duplicate key update last_seen_at = current_timestamp`,
        { replacements: { userId: Number(userId), clientType } },
    );
};
