import { AdminUserModel } from '../../../models/schema/AdminUserDB';
import { sequelize } from '../../../models/db-config-mysql';
import { QueryTypes } from 'sequelize';
import { reopenApprovedSubtitleDraft } from '.././subtitle-draft-reopening';
import type { CourseWorkflowAssignmentSource } from '../../../domain';
import type { SubtitleDraftStatus } from '../../../domain';
import { doRawQuery } from '../../../models';
import { doRawUpdate } from '../../../models';
import { MAX_CONCURRENT_CLAIMS } from './policy';
import type { ClaimAssignmentRow } from './policy';
import { isSqlTrue } from './policy';
import { recordWorkflowActivity } from './audit';
import { claimExpiryExpression } from './policy';
import type { ExpiredClaimRow } from './policy';
import { CLAIM_EXPIRING_NOTICE_HOURS } from './policy';

/**
 * 自助领取是竞争操作：靠 exercise_workflow_assignees 的
 * (exercise_id, workflow_role) 唯一键判定“刚被别人领走”，
 * 不能复用改派时的“先删后插”，否则会互相覆盖。
 */
export async function claimWorkflowTask(exerciseId: number, adminId: number) {
    const contributor = await AdminUserModel.findOne({
        attributes: ['id', 'role'],
        where: { id: adminId, role: 'subtitle_contributor' },
        raw: true,
    });
    if (!contributor) throw new Error('只有字幕贡献者可以领取任务');

    await sequelize.transaction(async (transaction) => {
        const activeCount = Number((await sequelize.query<{ total: number | string }>(
            `select count(*) as total
             from exercise_workflow_assignees assignees
             inner join exercises on exercises.id = assignees.exercise_id
             where assignees.workflow_role = 'proofreader'
               and assignees.admin_user_id = :adminId
               and exercises.status in ('draft', 'proofread')
               and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())`,
            { replacements: { adminId }, type: QueryTypes.SELECT, transaction },
        ))[0]?.total ?? 0);
        if (activeCount >= MAX_CONCURRENT_CLAIMS) {
            throw new Error(`你同时最多只能持有 ${MAX_CONCURRENT_CLAIMS} 门课程，请先完成或放弃现有任务`);
        }

        const [exercise] = await sequelize.query<{ status: string; audio_url: string }>(
            `select status, audio_url from exercises where id = :exerciseId limit 1 for update`,
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        if (!exercise || exercise.status !== 'draft') {
            throw new Error('该课程当前不在可领取的任务池中');
        }
        if (!String(exercise.audio_url ?? '').trim()) {
            throw new Error('该课程媒体尚未就绪，暂不能领取');
        }

        // 清扫器按分钟级周期运行，领取接口不能假设过期记录已经被清掉。
        // 课程行已锁住，下面再锁住现有工作流记录：只有当前校对负责人仍在有效期内
        // 才阻止接管。历史迁移只给校对行补过期时间，不能让二审行的 NULL 期限挡住接管。
        const existingAssignees = await sequelize.query<ClaimAssignmentRow>(
            `select workflow_role, admin_user_id,
                    case when claim_expires_at is not null and claim_expires_at <= utc_timestamp()
                         then 1 else 0 end as is_expired
             from exercise_workflow_assignees
             where exercise_id = :exerciseId
               and workflow_role in ('proofreader', 'second_reviewer')
             for update`,
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        const activeProofreader = existingAssignees.find(
            (row) => row.workflow_role === 'proofreader' && !isSqlTrue(row.is_expired),
        );
        if (activeProofreader) {
            throw new Error('该课程当前已被其他贡献者领取，请刷新任务池后重试');
        }

        // 任务池只以 proofreader 作为“是否有人领取”的锁；没有有效校对锁时，
        // 无论是过期记录还是历史遗留的孤立二审记录，都要在接管前一并清理。
        const staleAssignees = activeProofreader ? [] : existingAssignees;
        if (staleAssignees.length > 0) {
            const staleAdminIds = [...new Set(existingAssignees.map((row) => Number(row.admin_user_id)))];
            await sequelize.query(
                `delete from exercise_workflow_assignees
                 where exercise_id = :exerciseId
                   and admin_user_id in (:staleAdminIds)
                   and workflow_role in ('proofreader', 'second_reviewer')`,
                { replacements: { exerciseId, staleAdminIds }, transaction },
            );
            // 课程授权是编辑权限的兼容映射；接管时必须同时清除旧成员的映射，
            // 否则旧成员仍可能在下一次请求中看见并修改已经转交的课程。
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id = :exerciseId and admin_user_id in (:staleAdminIds)`,
                { replacements: { exerciseId, staleAdminIds }, transaction },
            );
            for (const staleAdminId of staleAdminIds) {
                await sequelize.query(
                    `insert into admin_workflow_notifications
                       (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
                     values (:staleAdminId, null, :exerciseId, null, 'task_claim_expired')`,
                    { replacements: { staleAdminId, exerciseId }, transaction },
                );
            }
            const staleProofreader = staleAssignees.find((row) => row.workflow_role === 'proofreader');
            if (staleProofreader) {
                await recordWorkflowActivity({
                    eventType: 'workflow_claim_expired',
                    actorAdminUserId: null,
                    targetAdminUserId: Number(staleProofreader.admin_user_id),
                    exerciseId,
                    workflowRole: 'proofreader',
                }, transaction);
            }
        }

        // 唯一键冲突会抛错，表示该课程刚被别人领取，避免重复工作。
        await sequelize.query(
            `insert into exercise_workflow_assignees
               (exercise_id, workflow_role, assignment_source, admin_user_id, claimed_at, claim_expires_at, expiring_notified_at)
             values
               (:exerciseId, 'proofreader', 'self_claimed', :adminId, utc_timestamp(), ${claimExpiryExpression()}, null),
               (:exerciseId, 'second_reviewer', 'self_claimed', :adminId, utc_timestamp(), ${claimExpiryExpression()}, null)`,
            { replacements: { exerciseId, adminId }, transaction },
        );
        await sequelize.query(
            `insert into exercise_contributor_assignments (exercise_id, admin_user_id)
             values (:exerciseId, :adminId)
             on duplicate key update admin_user_id = values(admin_user_id)`,
            { replacements: { exerciseId, adminId }, transaction },
        );
        await reopenApprovedSubtitleDraft(exerciseId, adminId, transaction);
        await recordWorkflowActivity({
            eventType: 'workflow_claimed',
            actorAdminUserId: adminId,
            targetAdminUserId: adminId,
            exerciseId,
            workflowRole: 'proofreader',
        }, transaction);
    });
}

/** 贡献者主动放弃自己领取的任务；已提交二审的课程不可放弃。 */
export async function releaseWorkflowTask(exerciseId: number, adminId: number) {
    await sequelize.transaction(async (transaction) => {
        const [assignee] = await sequelize.query<{ assignment_source: CourseWorkflowAssignmentSource }>(
            `select assignment_source from exercise_workflow_assignees
             where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId limit 1`,
            { replacements: { exerciseId, adminId }, type: QueryTypes.SELECT, transaction },
        );
        if (!assignee) throw new Error('你当前没有持有这门课程');
        if (assignee.assignment_source !== 'self_claimed') {
            throw new Error('管理员指派的任务不能自助放弃');
        }
        const [draft] = await sequelize.query<{ status: SubtitleDraftStatus }>(
            `select status from exercise_subtitle_drafts
             where exercise_id = :exerciseId and admin_user_id = :adminId limit 1`,
            { replacements: { exerciseId, adminId }, type: QueryTypes.SELECT, transaction },
        );
        if (draft?.status === 'submitted') {
            throw new Error('该课程已提交二审，不能放弃，请等待审核结果');
        }
        await sequelize.query(
            `delete from exercise_workflow_assignees
             where exercise_id = :exerciseId and admin_user_id = :adminId
               and workflow_role in ('proofreader', 'second_reviewer')
               and assignment_source = 'self_claimed'`,
            { replacements: { exerciseId, adminId }, transaction },
        );
        await sequelize.query(
            `delete from exercise_contributor_assignments
             where exercise_id = :exerciseId and admin_user_id = :adminId`,
            { replacements: { exerciseId, adminId }, transaction },
        );
        await recordWorkflowActivity({
            eventType: 'workflow_claim_released',
            actorAdminUserId: adminId,
            targetAdminUserId: adminId,
            exerciseId,
            workflowRole: 'proofreader',
        }, transaction);
    });
}

/**
 * 清扫器主逻辑：释放所有已过期的工作流任务，不区分管理员指派还是自助领取。
 * 惰性过期判定在查询/领取侧同时生效，因此即使清扫器短暂停摆也不会把过期锁当真。
 */
export async function expireOverdueClaims(): Promise<ExpiredClaimRow[]> {
    const rows = await sequelize.query<ExpiredClaimRow>(
        `select assignees.exercise_id, assignees.admin_user_id,
                coalesce(drafts.status, 'editing') as draft_status
         from exercise_workflow_assignees assignees
         left join exercise_subtitle_drafts drafts
           on drafts.exercise_id = assignees.exercise_id
          and drafts.admin_user_id = assignees.admin_user_id
         where assignees.workflow_role = 'proofreader'
           and assignees.claim_expires_at is not null
           and assignees.claim_expires_at <= utc_timestamp()
           and coalesce(drafts.status, 'editing') <> 'submitted'`,
        { type: QueryTypes.SELECT },
    );
    for (const row of rows) {
        const exerciseId = Number(row.exercise_id);
        const adminId = Number(row.admin_user_id);
        await sequelize.transaction(async (transaction) => {
            const [, metadata] = await sequelize.query(
                `delete from exercise_workflow_assignees
                 where exercise_id = :exerciseId and admin_user_id = :adminId
                   and workflow_role in ('proofreader', 'second_reviewer')`,
                { replacements: { exerciseId, adminId }, transaction },
            );
            if ((metadata as { affectedRows?: number }).affectedRows === 0) return;
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id = :exerciseId and admin_user_id = :adminId`,
                { replacements: { exerciseId, adminId }, transaction },
            );
            await sequelize.query(
                `insert into admin_workflow_notifications
                   (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
                 values (:adminId, null, :exerciseId, null, 'task_claim_expired')`,
                { replacements: { exerciseId, adminId }, transaction },
            );
            await recordWorkflowActivity({
                eventType: 'workflow_claim_expired',
                actorAdminUserId: null,
                targetAdminUserId: adminId,
                exerciseId,
                workflowRole: 'proofreader',
            }, transaction);
        });
    }
    return rows;
}

/** 给即将到期（12 小时内）的工作流任务发一次提醒，避免任务被静默释放。 */
export async function notifyExpiringClaims(now: Date) {
    const threshold = new Date(now.getTime() + CLAIM_EXPIRING_NOTICE_HOURS * 60 * 60 * 1000);
    const rows = await doRawQuery<{ exercise_id: number | string; admin_user_id: number | string }>({
        query: `select assignees.exercise_id, assignees.admin_user_id
                from exercise_workflow_assignees assignees
                inner join exercise_subtitle_drafts drafts
                  on drafts.exercise_id = assignees.exercise_id
                 and drafts.admin_user_id = assignees.admin_user_id
                where assignees.workflow_role = 'proofreader'
                  and assignees.claim_expires_at is not null
                  and assignees.claim_expires_at > utc_timestamp()
                  and assignees.claim_expires_at <= :threshold
                  and assignees.expiring_notified_at is null
                  and drafts.status in ('editing', 'returned')`,
        params: { threshold },
    });
    for (const row of rows) {
        const exerciseId = Number(row.exercise_id);
        const adminId = Number(row.admin_user_id);
        await sequelize.query(
            `update exercise_workflow_assignees
             set expiring_notified_at = utc_timestamp()
             where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId`,
            { replacements: { exerciseId, adminId } },
        );
        await sequelize.query(
            `insert into admin_workflow_notifications
               (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
             values (:adminId, null, :exerciseId, null, 'task_claim_expiring')`,
            { replacements: { exerciseId, adminId } },
        );
    }
}

/** 超级管理员可对单门课程关闭/开启自助领取，不影响已分配课程的编辑权。 */
export async function updateExerciseClaimAvailability(exerciseId: number, claimBlocked: boolean) {
    const rows = await doRawQuery<{ id: number | string }>({
        query: 'select id from exercises where id = :exerciseId limit 1',
        params: { exerciseId },
    });
    if (!rows[0]) throw new Error('课程不存在');
    await doRawUpdate(
        'update exercises set claim_blocked = :claimBlocked where id = :exerciseId',
        { exerciseId, claimBlocked: claimBlocked ? 1 : 0 },
    );
    return { exerciseId, claimBlocked };
}
