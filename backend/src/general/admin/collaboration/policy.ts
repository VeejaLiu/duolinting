import type { AdminRole } from '../../../domain';
import type { CourseContributionRole } from '../../../domain';
import type { SubtitleDraftStatus } from '../../../domain';
import type { AdminTaskClaimPolicy } from '../../../domain';
import { doRawQuery } from '../../../models';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../../models/db-config-mysql';

export type AdminActor = {
    id: number;
    role: AdminRole;
    mustChangePassword?: boolean;
};

export const normalizeAdminRole = (role: unknown): AdminRole =>
    role === 'subtitle_contributor' ? 'subtitle_contributor' : 'super_admin';

export const isSuperAdmin = (admin: AdminActor | undefined | null) =>
    admin?.role === 'super_admin';

/**
 * 任务领取策略常量。领取期限是滑动窗口：每次保存校对草稿都会把期限顺延到
 * “当前时刻 + CLAIM_WINDOW_HOURS”；这样真正在工作的人不会被自动释放，
 * 只有长期不保存的失联任务才会回到任务池。到期前 12 小时发一次提醒。
 */
export const CLAIM_WINDOW_HOURS = 48;

export const CLAIM_EXPIRING_NOTICE_HOURS = 12;

export const MAX_CONCURRENT_CLAIMS = 3;

/**
 * 领取期限的 SQL 表达式：领取时刻之后的 CLAIM_WINDOW_HOURS 小时。
 * 用参数化小时数构造，避免把业务时长硬编码进 SQL 字符串。
 */
export const claimExpiryExpression = () => `date_add(utc_timestamp(), interval ${Number(CLAIM_WINDOW_HOURS)} hour)`;

export type ClaimAssignmentRow = {
    workflow_role: CourseContributionRole;
    admin_user_id: number | string;
    // MySQL returns this CASE expression as 0/1; keep the wider type for driver differences.
    is_expired: boolean | number | string;
};

export type ExpiredClaimRow = {
    exercise_id: number | string;
    admin_user_id: number | string;
    draft_status: SubtitleDraftStatus | null;
};

export const isSqlTrue = (value: boolean | number | string) =>
    value === true || value === 1 || value === '1';

// null 表示已停止计时（例如已提交二审），其余时间值必须仍在当前时刻之后。
// 这里给任务中心的结果集做一次惰性校验，避免清扫器尚未运行时继续展示过期任务。
export const isClaimWindowActive = (claimExpiresAt: Date | string | null | undefined) => {
    if (claimExpiresAt === null || claimExpiresAt === undefined) return true;
    const expiresAt = new Date(claimExpiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

/** 任务池与领取策略；贡献者和超级管理员共用同一份口径。 */
export function getTaskClaimPolicy(): AdminTaskClaimPolicy {
    return {
        claimWindowHours: CLAIM_WINDOW_HOURS,
        maxConcurrentClaims: MAX_CONCURRENT_CLAIMS,
        myActiveClaimCount: 0,
    };
}

/** 当前成员仍在进行中的课程数，含管理员指派与自助领取，用于并发上限校验。 */
export async function countActiveProofreadingClaims(adminId: number): Promise<number> {
    const rows = await doRawQuery<{ total: number | string }>({
        query: `select count(*) as total
                from exercise_workflow_assignees assignees
                inner join exercises on exercises.id = assignees.exercise_id
                where assignees.workflow_role = 'proofreader'
                  and assignees.admin_user_id = :adminId
                  and exercises.status in ('draft', 'proofread')
                  and (
                    assignees.claim_expires_at is null
                    or assignees.claim_expires_at > utc_timestamp()
                  )`,
        params: { adminId },
    });
    return Number(rows[0]?.total ?? 0);
}

/** 保存校对草稿时顺延滑动期限：真正在干活的人不会被自动释放。 */
export async function renewClaimWindow(exerciseId: number, adminId: number) {
    await sequelize.query(
        `update exercise_workflow_assignees
         set claim_expires_at = ${claimExpiryExpression()},
             expiring_notified_at = null
         where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId`,
        { replacements: { exerciseId, adminId } },
    );
}

/** 提交或审核通过后停止计时；任务不再回到池子里。 */
export async function clearClaimDeadline(exerciseId: number, adminId: number, transaction: Transaction) {
    await sequelize.query(
        `update exercise_workflow_assignees
         set claim_expires_at = null, expiring_notified_at = null
         where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId`,
        { replacements: { exerciseId, adminId }, transaction },
    );
}
