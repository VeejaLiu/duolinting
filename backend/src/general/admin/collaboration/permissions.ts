import { doRawQuery } from '../../../models';
import type { CourseContributionRole } from '../../../domain';
import type { AdminActor } from './policy';
import { isSuperAdmin } from './policy';

export async function getAssignedExerciseIds(adminId: number) {
    const rows = await doRawQuery<{ exercise_id: number | string }>({
        // 校对人与二审人都需要在“课程管理”中看见当前任务；待审核稿保留提交时的审核人快照，
        // 因此重新分配负责人后，原审核人仍能完成已经交到自己手里的任务。
        // 课程授权表没有期限字段，必须通过当前校对负责人记录判断它是否已经过期。
        query: `select assignments.exercise_id
                from exercise_contributor_assignments assignments
                where assignments.admin_user_id = ?
                  and (
                    not exists (
                      select 1 from exercise_workflow_assignees workflow
                      where workflow.exercise_id = assignments.exercise_id
                        and workflow.workflow_role = 'proofreader'
                    )
                    or exists (
                      select 1 from exercise_workflow_assignees workflow
                      where workflow.exercise_id = assignments.exercise_id
                        and workflow.workflow_role = 'proofreader'
                        and workflow.admin_user_id = ?
                        and (workflow.claim_expires_at is null or workflow.claim_expires_at > utc_timestamp())
                    )
                  )
                union
                select assignees.exercise_id
                from exercise_workflow_assignees assignees
                where assignees.admin_user_id = ?
                  and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())
                  and (
                    assignees.workflow_role = 'proofreader'
                    or not exists (
                      select 1 from exercise_workflow_assignees expired_proofreader
                      where expired_proofreader.exercise_id = assignees.exercise_id
                        and expired_proofreader.workflow_role = 'proofreader'
                        and expired_proofreader.claim_expires_at is not null
                        and expired_proofreader.claim_expires_at <= utc_timestamp()
                    )
                  )
                union
                select exercise_id from exercise_subtitle_drafts
                where reviewer_admin_user_id = ? and status = 'submitted'`,
        params: [adminId, adminId, adminId, adminId],
    });
    return rows.map((row) => Number(row.exercise_id));
}

export async function canEditExerciseSubtitles(admin: AdminActor, exerciseId: number) {
    if (isSuperAdmin(admin)) return true;
    const rows = await doRawQuery<{ id: number | string }>({
        query: `select assignments.id
                from exercise_contributor_assignments assignments
                left join exercise_subtitle_drafts drafts
                  on drafts.exercise_id = assignments.exercise_id and drafts.admin_user_id = assignments.admin_user_id
                where assignments.admin_user_id = ? and assignments.exercise_id = ?
                  and (drafts.id is null or drafts.status in ('editing', 'returned'))
                  and (
                    exists (
                      select 1 from exercise_workflow_assignees workflow
                      where workflow.exercise_id = assignments.exercise_id
                        and workflow.workflow_role = 'proofreader'
                        and workflow.admin_user_id = assignments.admin_user_id
                        and (workflow.claim_expires_at is null or workflow.claim_expires_at > utc_timestamp())
                    )
                    or not exists (
                      select 1 from exercise_workflow_assignees workflow
                      where workflow.exercise_id = assignments.exercise_id
                        and workflow.workflow_role = 'proofreader'
                    )
                  )
                limit 1`,
        params: [admin.id, exerciseId],
    });
    return rows.length > 0;
}

async function isWorkflowAssignee(
    exerciseId: number,
    adminId: number,
    workflowRole: CourseContributionRole,
) {
    const rows = await doRawQuery<{ id: number | string }>({
        query: `select assignees.id from exercise_workflow_assignees assignees
                where assignees.exercise_id = ? and assignees.admin_user_id = ? and assignees.workflow_role = ?
                  and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())
                  and (
                    assignees.workflow_role = 'proofreader'
                    or not exists (
                      select 1 from exercise_workflow_assignees expired_proofreader
                      where expired_proofreader.exercise_id = assignees.exercise_id
                        and expired_proofreader.workflow_role = 'proofreader'
                        and expired_proofreader.claim_expires_at is not null
                        and expired_proofreader.claim_expires_at <= utc_timestamp()
                    )
                  )
                limit 1`,
        params: [exerciseId, adminId, workflowRole],
    });
    return rows.length > 0;
}

/** 课程详情对两种当前负责人均可见；过期负责人不再获得工作流访问权。 */
export async function canAccessExerciseWorkflow(admin: AdminActor, exerciseId: number) {
    if (isSuperAdmin(admin)) return true;
    if (await canEditExerciseSubtitles(admin, exerciseId)) return true;
    if (await isWorkflowAssignee(exerciseId, admin.id, 'second_reviewer')) return true;
    const reviewTasks = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_subtitle_drafts
                where exercise_id = ? and reviewer_admin_user_id = ? and status = 'submitted' limit 1`,
        params: [exerciseId, admin.id],
    });
    return reviewTasks.length > 0;
}

/**
 * 仅课程指定的校对负责人可提交，避免把“可编辑”误当成“可提交二审”。
 * 尚未采用负责人机制的旧课程，保留原先“被授权即可提交”的兼容行为。
 */
export async function canSubmitSubtitleDraft(admin: AdminActor, exerciseId: number) {
    // 超级管理员只负责配置负责人与维护正式内容，不参与协作流程，更不能提交校对稿。
    if (isSuperAdmin(admin)) return false;
    const proofreaderIsAssigned = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_workflow_assignees
                where exercise_id = ? and workflow_role = 'proofreader' limit 1`,
        params: [exerciseId],
    });
    return proofreaderIsAssigned.length > 0
        ? isWorkflowAssignee(exerciseId, admin.id, 'proofreader')
        : canEditExerciseSubtitles(admin, exerciseId);
}

/**
 * 提交时必须同时冻结校对和审核职责。审核负责人不是可选提示：没有明确接收人就
 * 不允许把字幕稿送出，避免出现无人可处理的待审稿。
 */
export async function getWorkflowSubmissionAssignees(exerciseId: number) {
    const rows = await doRawQuery<{
        workflow_role: CourseContributionRole;
        admin_user_id: number | string;
    }>({
        query: `select workflow_role, admin_user_id from exercise_workflow_assignees
                where exercise_id = ? and workflow_role in ('proofreader', 'second_reviewer')`,
        params: [exerciseId],
    });
    const proofreaderId = rows.find((row) => row.workflow_role === 'proofreader')?.admin_user_id;
    const reviewerId = rows.find((row) => row.workflow_role === 'second_reviewer')?.admin_user_id;
    if (!proofreaderId || !reviewerId) {
        throw new Error('请先为本课程同时指定校对和审核人员，才能提交审核');
    }
    return { proofreaderId: Number(proofreaderId), reviewerId: Number(reviewerId) };
}

/** 二次审核也由贡献者承担，必须由本课已配置的二审负责人完成。 */
export async function canReviewSubtitleDraft(admin: AdminActor, exerciseId: number) {
    if (await isWorkflowAssignee(exerciseId, admin.id, 'second_reviewer')) return true;
    const snapshotTasks = await doRawQuery<{ id: number | string }>({
        query: `select id from exercise_subtitle_drafts
                where exercise_id = ? and reviewer_admin_user_id = ? and status = 'submitted' limit 1`,
        params: [exerciseId, admin.id],
    });
    return snapshotTasks.length > 0;
}
