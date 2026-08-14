import { doRawQuery } from '../../models';

type AdminUserActivityLevel = 'today' | 'this_week' | 'this_month' | 'inactive' | 'never_started';

type UserActivityQueryRow = {
    user_id: number | string;
    email: string;
    display_name: string;
    created_at: string | Date;
    last_active_at: string | Date | null;
    last_exercise_title: string | null;
    studied_exercise_count: number | string | null;
    touched_line_count: number | string | null;
    mastered_line_count: number | string | null;
    unclear_line_count: number | string | null;
    repeat_total: number | string | null;
    note_count: number | string | null;
    dictation_count: number | string | null;
    feedback_count: number | string | null;
};

type AdminUserActivityItem = {
    userId: number;
    email: string;
    displayName: string;
    registeredAt: string;
    lastActiveAt: string | null;
    lastExerciseTitle: string;
    studiedExerciseCount: number;
    touchedLineCount: number;
    masteredLineCount: number;
    unclearLineCount: number;
    repeatTotal: number;
    noteCount: number;
    dictationCount: number;
    feedbackCount: number;
    activityLevel: AdminUserActivityLevel;
};

const toNumber = (value: number | string | null | undefined) =>
    value === null || value === undefined ? 0 : Number(value);

const toIsoString = (value: string | Date | null) => {
    if (!value) {
        return null;
    }
    return new Date(value).toISOString();
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 活跃层级按"自然日"划分（以服务器本地时区的 0 点为界），与 Admin 面板
 * "今日活跃 / 近 7 天 / 近 30 天"的文案口径一致：
 * - today:         最后活跃时间在今天 0 点（含）之后；
 * - this_week:     最近 7 个自然日内活跃过（含今天，即从今天 0 点往前推 6 天）；
 * - this_month:    最近 30 个自然日内活跃过（含今天，即从今天 0 点往前推 29 天）；
 * - inactive:      曾经活跃，但已超过 30 个自然日未活跃；
 * - never_started: 从未产生任何学习/反馈记录——与 inactive 分开，
 *                  避免刚注册、还没来得及学习的用户被误归为"沉默用户"。
 */
const getActivityLevel = (lastActiveAt: string | null): AdminUserActivityLevel => {
    if (!lastActiveAt) {
        return 'never_started';
    }

    const activeAt = new Date(lastActiveAt).getTime();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (activeAt >= startOfToday) {
        return 'today';
    }
    if (activeAt >= startOfToday - 6 * DAY_MS) {
        return 'this_week';
    }
    if (activeAt >= startOfToday - 29 * DAY_MS) {
        return 'this_month';
    }
    return 'inactive';
};

const mapUserActivityItem = (row: UserActivityQueryRow): AdminUserActivityItem => {
    const lastActiveAt = toIsoString(row.last_active_at);
    return {
        userId: Number(row.user_id),
        email: row.email,
        displayName: row.display_name,
        registeredAt: new Date(row.created_at).toISOString(),
        lastActiveAt,
        lastExerciseTitle: row.last_exercise_title ?? '',
        studiedExerciseCount: toNumber(row.studied_exercise_count),
        touchedLineCount: toNumber(row.touched_line_count),
        masteredLineCount: toNumber(row.mastered_line_count),
        unclearLineCount: toNumber(row.unclear_line_count),
        repeatTotal: toNumber(row.repeat_total),
        noteCount: toNumber(row.note_count),
        dictationCount: toNumber(row.dictation_count),
        feedbackCount: toNumber(row.feedback_count),
        activityLevel: getActivityLevel(lastActiveAt),
    };
};

export async function getAdminUserActivityReport() {
    const rows = await doRawQuery<UserActivityQueryRow>({
        query: `
            select
                u.id as user_id,
                u.email,
                u.display_name,
                u.created_at,
                case
                    when ep.last_exercise_activity_at is null
                     and lp.last_line_activity_at is null
                     and af.last_feedback_at is null
                        then null
                    else greatest(
                        coalesce(ep.last_exercise_activity_at, '1970-01-01 00:00:00'),
                        coalesce(lp.last_line_activity_at, '1970-01-01 00:00:00'),
                        coalesce(af.last_feedback_at, '1970-01-01 00:00:00')
                    )
                end as last_active_at,
                (
                    select e.title
                    from exercise_progress ep2
                    left join exercises e on e.id = ep2.exercise_id
                    where ep2.user_id = u.id
                    order by ep2.updated_at desc, ep2.id desc
                    limit 1
                ) as last_exercise_title,
                coalesce(ep.studied_exercise_count, 0) as studied_exercise_count,
                coalesce(lp.touched_line_count, 0) as touched_line_count,
                coalesce(lp.mastered_line_count, 0) as mastered_line_count,
                coalesce(lp.unclear_line_count, 0) as unclear_line_count,
                coalesce(lp.repeat_total, 0) as repeat_total,
                coalesce(lp.note_count, 0) as note_count,
                coalesce(lp.dictation_count, 0) as dictation_count,
                coalesce(af.feedback_count, 0) as feedback_count
            from users u
            left join (
                select
                    user_id,
                    max(updated_at) as last_exercise_activity_at,
                    count(distinct exercise_id) as studied_exercise_count
                from exercise_progress
                group by user_id
            ) ep on ep.user_id = u.id
            left join (
                select
                    user_id,
                    max(updated_at) as last_line_activity_at,
                    count(*) as touched_line_count,
                    sum(case when mastered then 1 else 0 end) as mastered_line_count,
                    sum(case when unclear then 1 else 0 end) as unclear_line_count,
                    sum(repeat_count) as repeat_total,
                    sum(case when char_length(trim(note)) > 0 then 1 else 0 end) as note_count,
                    sum(case when char_length(trim(dictation)) > 0 then 1 else 0 end) as dictation_count
                from line_progress
                group by user_id
            ) lp on lp.user_id = u.id
            left join (
                select
                    user_id,
                    max(created_at) as last_feedback_at,
                    count(*) as feedback_count
                from accepted_answer_feedback
                group by user_id
            ) af on af.user_id = u.id
            order by
                last_active_at desc,
                u.created_at desc,
                u.id desc
        `,
    });

    /**
     * Field meaning:
     * - studiedExerciseCount: how many exercises have at least one saved exercise-level progress row.
     * - touchedLineCount: how many distinct exercise-line rows have detailed study records.
     * - masteredLineCount / unclearLineCount: count of line rows currently marked by the learner.
     * - repeatTotal: total repeat_count accumulation across all saved line rows.
     * - noteCount / dictationCount: how many line rows contain non-empty learner note or dictation text.
     * - feedbackCount: accepted-answer feedback submissions sent from the learner side.
     *
     * We keep these metrics explicit instead of flattening them into one score so Admin can judge
     * whether "active" means recent access, deep line-by-line study, or proactive feedback behavior.
     */
    const items = rows.map(mapUserActivityItem);

    const summary = items.reduce(
        (acc, item) => {
            acc.totalUsers += 1;
            acc.totalLineTouches += item.touchedLineCount;
            acc.totalMasteredLines += item.masteredLineCount;
            acc.totalFeedbackCount += item.feedbackCount;

            if (item.lastActiveAt) {
                acc.active30dCount += item.activityLevel === 'inactive' ? 0 : 1;
                if (item.activityLevel === 'today' || item.activityLevel === 'this_week') {
                    acc.active7dCount += 1;
                }
                if (item.activityLevel === 'today') {
                    acc.activeTodayCount += 1;
                }
            } else {
                acc.neverStartedCount += 1;
            }

            if (item.activityLevel === 'inactive') {
                acc.inactiveCount += 1;
            }
            if (item.studiedExerciseCount > 0 || item.touchedLineCount > 0) {
                acc.usersWithProgressCount += 1;
            }
            if (item.feedbackCount > 0) {
                acc.usersWithFeedbackCount += 1;
            }

            return acc;
        },
        {
            totalUsers: 0,
            activeTodayCount: 0,
            active7dCount: 0,
            active30dCount: 0,
            inactiveCount: 0,
            neverStartedCount: 0,
            usersWithProgressCount: 0,
            usersWithFeedbackCount: 0,
            totalLineTouches: 0,
            totalMasteredLines: 0,
            totalFeedbackCount: 0,
        },
    );

    return {
        // 报表生成时间，Admin 面板据此展示"数据更新于 ..."
        generatedAt: new Date().toISOString(),
        summary,
        items,
    };
}
