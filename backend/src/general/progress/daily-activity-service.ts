import type { DailyActivitySummary } from '../../domain';
import { doRawQuery } from '../../models';
import { sequelize } from '../../models/db-config-mysql';

// yyyy-MM-dd：streak 按用户本地自然日计算，日期由客户端上报，服务端只校验格式。
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ActivityRow = {
    day: Date | string;
    mastered_count: number;
};

const formatDay = (value: Date | string): string => {
    if (value instanceof Date) {
        // mysql2 会把 date 列解析为本地 Date，直接取年月日避免 toISOString 的时区偏移
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return String(value).slice(0, 10);
};

/** 上报一次「掌握」：按 (user_id, day) 累加 mastered_count，取消掌握不扣减。 */
export const recordMasteredActivity = async (
    userId: number | string,
    day: string,
    masteredDelta = 1,
): Promise<void> => {
    if (!DAY_PATTERN.test(day) || !Number.isInteger(masteredDelta) || masteredDelta < 1) {
        return;
    }
    await sequelize.query(
        `insert into user_daily_activity (user_id, day, mastered_count)
         values (:userId, :day, :masteredDelta)
         on duplicate key update mastered_count = mastered_count + values(mastered_count)`,
        { replacements: { userId, day, masteredDelta } },
    );
};

/** 读取用户全部每日活动记录，返回 { 'yyyy-MM-dd': masteredCount } 供 streak/今日进度计算。 */
export const getDailyActivitySummary = async (userId: number | string): Promise<DailyActivitySummary> => {
    const rows = await doRawQuery<ActivityRow>({
        query: 'select day, mastered_count from user_daily_activity where user_id = ? order by day asc',
        params: [userId],
    });
    const days: Record<string, number> = {};
    for (const row of rows) {
        days[formatDay(row.day)] = row.mastered_count;
    }
    return { days };
};
