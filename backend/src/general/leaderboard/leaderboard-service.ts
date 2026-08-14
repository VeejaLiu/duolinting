import type { LeaderboardEntry, LeaderboardResponse } from '../../domain';
import { doRawQuery } from '../../models';

/** 榜单长度：只展示前 50 名 */
const LEADERBOARD_LIMIT = 50;

type LeaderboardRow = {
    user_id: number | string;
    display_name: string | null;
    mastered_count: number | string;
};

type MasteredCountRow = {
    mastered_count: number | string;
};

type RankRow = {
    rank: number | string;
};

const toNumber = (value: number | string | null | undefined) =>
    value === null || value === undefined ? 0 : Number(value);

/**
 * 排行榜口径说明：
 * - 计分字段是 line_progress.mastered（用户当前标记为"已掌握"的句子数），
 *   与 Admin 用户活跃报表的 mastered_line_count 口径一致；
 * - 取消掌握会减分，反映的是"当前掌握量"而不是历史累计动作；
 * - 只统计 mastered_count > 0 的用户，零掌握用户不进榜；
 * - 名次即按掌握数降序后的行号（不跳名次处理并列，简单直观），
 *   掌握数相同按 user_id 升序，保证榜单顺序稳定。
 *
 * 隐私约束：排行榜是面向所有登录用户的公开数据，只返回 display_name，
 * 绝不查询/返回 email 等账号信息；昵称为空时兜底为"学员#{id}"。
 */
export async function getLeaderboard(currentUserId: number): Promise<LeaderboardResponse> {
    const rows = await doRawQuery<LeaderboardRow>({
        query: `
            select
                u.id as user_id,
                u.display_name,
                t.mastered_count
            from (
                select
                    user_id,
                    sum(case when mastered then 1 else 0 end) as mastered_count
                from line_progress
                group by user_id
                having mastered_count > 0
            ) t
            join users u on u.id = t.user_id
            order by t.mastered_count desc, u.id asc
            limit ?
        `,
        params: [LEADERBOARD_LIMIT],
    });

    const entries: LeaderboardEntry[] = rows.map((row, index) => ({
        rank: index + 1,
        displayName: (row.display_name ?? '').trim() || `学员#${row.user_id}`,
        masteredLineCount: toNumber(row.mastered_count),
        isCurrentUser: Number(row.user_id) === currentUserId,
    }));

    // 当前用户已进榜：直接从榜单条目里取，不再查库
    const selfEntry = entries.find((entry) => entry.isCurrentUser);
    if (selfEntry) {
        return {
            entries,
            currentUser: { rank: selfEntry.rank, masteredLineCount: selfEntry.masteredLineCount },
        };
    }

    // 当前用户未进 top 50：单独查其掌握数
    const countRows = await doRawQuery<MasteredCountRow>({
        query: `
            select coalesce(sum(case when mastered then 1 else 0 end), 0) as mastered_count
            from line_progress
            where user_id = ?
        `,
        params: [currentUserId],
    });
    const masteredCount = toNumber(countRows[0]?.mastered_count);

    // 零掌握不参与排名，currentUser 返回 null，客户端提示"掌握第一句即可上榜"
    if (masteredCount === 0) {
        return { entries, currentUser: null };
    }

    /*
     * 名次 = 掌握数严格多于我的人数 + 1。
     * 与 top50 的"行号即名次"口径一致：掌握数并列时共享同一名次起点
     * （例如我前面有 10 个人掌握数都比我多，不管他们之间是否并列，我都是第 11 名）。
     */
    const rankRows = await doRawQuery<RankRow>({
        query: `
            select count(*) + 1 as rank
            from (
                select sum(case when mastered then 1 else 0 end) as mastered_count
                from line_progress
                group by user_id
                having mastered_count > ?
            ) t
        `,
        params: [masteredCount],
    });

    return {
        entries,
        currentUser: { rank: toNumber(rankRows[0]?.rank), masteredLineCount: masteredCount },
    };
}
