import { sequelize } from '../../models/db-config-mysql';
import type { AuthClientType } from './user-session-service';

/**
 * 写入当天的端侧访问事实。
 *
 * v2 的日期固定为上海自然日，时间字段固定为 UTC。旧表继续保留其原始
 * 服务器日期，供旧版本兼容，报表在核实来源时区后合并两种事实。
 * 唯一键保证同一用户在同一端当天只计为一个活跃用户；
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
    await sequelize.query(
        `insert into user_access_daily_v2 (user_id,client_type,stat_date,first_seen_at,last_seen_at)
         values (:userId,:clientType,date(utc_timestamp()+interval 8 hour),utc_timestamp(3),utc_timestamp(3))
         on duplicate key update last_seen_at=utc_timestamp(3)`,
        { replacements: { userId: Number(userId), clientType } },
    );
};
