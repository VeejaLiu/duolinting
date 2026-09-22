import { doRawQuery } from '../../../models';
import { AdminUserModel } from '../../../models/schema/AdminUserDB';
import { sequelize } from '../../../models/db-config-mysql';
import { QueryTypes } from 'sequelize';
import { reopenApprovedSubtitleDraft } from '.././subtitle-draft-reopening';
import type { CourseContributionRole } from '../../../domain';
import { claimExpiryExpression } from './policy';
import { recordWorkflowActivity } from './audit';

const normalizeAssignedExerciseIds = (ids: unknown) =>
    [...new Set(
        (Array.isArray(ids) ? ids : [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
    )];

async function ensureExerciseIdsExist(exerciseIds: number[]) {
    if (exerciseIds.length === 0) return;
    const rows = await doRawQuery<{ id: number | string }>({
        query: 'select id from exercises where id in (:exerciseIds)',
        params: { exerciseIds },
    });
    if (rows.length !== exerciseIds.length) {
        throw new Error('所选课程中存在已删除或无效的课程');
    }
}

export async function replaceContributorAssignments(
    contributorId: number,
    exerciseIdsInput: unknown,
) {
    const exerciseIds = normalizeAssignedExerciseIds(exerciseIdsInput);
    const contributor = await AdminUserModel.findOne({
        where: { id: contributorId, role: 'subtitle_contributor' },
        raw: true,
    });
    if (!contributor) {
        throw new Error('字幕贡献者不存在');
    }
    await ensureExerciseIdsExist(exerciseIds);
    await sequelize.transaction(async (transaction) => {
        const previousAssignments = await sequelize.query<{ exercise_id: number | string }>(
            `select exercise_id from exercise_contributor_assignments where admin_user_id = :contributorId`,
            { replacements: { contributorId }, type: QueryTypes.SELECT, transaction },
        );
        await sequelize.query(
            'delete from exercise_contributor_assignments where admin_user_id = :contributorId',
            { replacements: { contributorId }, transaction },
        );
        if (exerciseIds.length > 0) {
            await sequelize.query(
                `insert into exercise_contributor_assignments (exercise_id, admin_user_id)
                 values ${exerciseIds.map(() => '(?, ?)').join(', ')}`,
                {
                    replacements: exerciseIds.flatMap((exerciseId) => [exerciseId, contributorId]),
                    transaction,
                },
            );
        }

        // 课程授权与当前简化工作流保持一致：同一位贡献者自动承担校对和二次审核，
        // 这样分配课程后即可直接开始校对，提交时也一定有明确的审核接收人。
        if (exerciseIds.length > 0) {
            // 与自助领取一致，旧的已通过稿不能阻塞重新指派后的校对。
            for (const exerciseId of [...exerciseIds].sort((left, right) => left - right)) {
                await reopenApprovedSubtitleDraft(exerciseId, contributorId, transaction);
            }
            // 当前简化模式一门课程只保留一位字幕贡献者；重新分配时替换旧的课程授权。
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id in (:exerciseIds) and admin_user_id <> :contributorId`,
                { replacements: { exerciseIds, contributorId }, transaction },
            );
            await sequelize.query(
                `delete from exercise_workflow_assignees
                 where exercise_id in (:exerciseIds)
                   and workflow_role in ('proofreader', 'second_reviewer')`,
                { replacements: { exerciseIds }, transaction },
            );
            await sequelize.query(
                `insert into exercise_workflow_assignees
                   (exercise_id, workflow_role, assignment_source, admin_user_id, claimed_at, claim_expires_at, expiring_notified_at)
                 values ${exerciseIds.flatMap(() => ["(?, 'proofreader', 'admin_assigned', ?, utc_timestamp(), date_add(utc_timestamp(), interval 48 hour), null)", "(?, 'second_reviewer', 'admin_assigned', ?, utc_timestamp(), date_add(utc_timestamp(), interval 48 hour), null)"]).join(', ')}`,
                {
                    replacements: exerciseIds.flatMap((exerciseId) => [exerciseId, contributorId, exerciseId, contributorId]),
                    transaction,
                },
            );
        }
        const removedExerciseIds = previousAssignments
            .map((row) => Number(row.exercise_id))
            .filter((exerciseId) => !exerciseIds.includes(exerciseId));
        if (removedExerciseIds.length > 0) {
            await sequelize.query(
                `delete from exercise_workflow_assignees
                 where exercise_id in (:removedExerciseIds)
                   and admin_user_id = :contributorId
                   and workflow_role in ('proofreader', 'second_reviewer')`,
                { replacements: { removedExerciseIds, contributorId }, transaction },
            );
        }
    });
    return exerciseIds;
}

/** 从课程维度维护授权，供课程列表中的贡献者下拉框直接调用。 */
/**
 * 为课程指定唯一字幕贡献者。当前简化流程中，该成员同时承担校对和二次审核；
 * 超级管理员只负责配置，不会被误写入贡献者工作流。
 */
export async function updateExerciseWorkflowAssignee({
    exerciseId,
    workflowRole,
    adminUserId,
    actorAdminUserId,
}: {
    exerciseId: number;
    workflowRole: CourseContributionRole;
    adminUserId: number | null;
    actorAdminUserId: number;
}) {
    if (workflowRole !== 'proofreader' && workflowRole !== 'second_reviewer') {
        throw new Error('无效的工作流步骤');
    }
    await ensureExerciseIdsExist([exerciseId]);
    if (adminUserId !== null) {
        const contributor = await AdminUserModel.findOne({
            attributes: ['id'],
            where: { id: adminUserId, role: 'subtitle_contributor' },
            raw: true,
        });
        if (!contributor) {
            throw new Error('所选人员不是有效的字幕贡献者');
        }
    }

    await sequelize.transaction(async (transaction) => {
        const existingAssignees = await sequelize.query<{
            workflow_role: CourseContributionRole;
            admin_user_id: number | string;
        }>(
            `select workflow_role, admin_user_id
             from exercise_workflow_assignees
             where exercise_id = :exerciseId and workflow_role in ('proofreader', 'second_reviewer')`,
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        const previousProofreaderId = Number(existingAssignees.find((row) => row.workflow_role === 'proofreader')?.admin_user_id ?? 0);
        const previousReviewerId = Number(existingAssignees.find((row) => row.workflow_role === 'second_reviewer')?.admin_user_id ?? 0);
        const previousAssigneeId = previousProofreaderId || previousReviewerId;
        // 当前流程由同一位贡献者负责校对和二审；从任一步骤选择人员时同步更新两步。
        await sequelize.query(
            `delete from exercise_workflow_assignees
             where exercise_id = :exerciseId and workflow_role in ('proofreader', 'second_reviewer')`,
            { replacements: { exerciseId }, transaction },
        );
        if (adminUserId !== null) {
            await reopenApprovedSubtitleDraft(exerciseId, adminUserId, transaction);
            await sequelize.query(
                `insert into exercise_workflow_assignees
                   (exercise_id, workflow_role, assignment_source, admin_user_id, claimed_at, claim_expires_at, expiring_notified_at)
                 values (:exerciseId, 'proofreader', 'admin_assigned', :adminUserId, utc_timestamp(), ${claimExpiryExpression()}, null),
                        (:exerciseId, 'second_reviewer', 'admin_assigned', :adminUserId, utc_timestamp(), ${claimExpiryExpression()}, null)`,
                { replacements: { exerciseId, adminUserId }, transaction },
            );
            // 补齐旧流程遗留的“未分配待审稿”，让它们进入这位贡献者的队列。
            await sequelize.query(
                `insert into admin_workflow_notifications
                   (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
                 select :adminUserId, drafts.admin_user_id, drafts.exercise_id, drafts.id, 'subtitle_submitted'
                 from exercise_subtitle_drafts drafts
                 where drafts.exercise_id = :exerciseId
                   and drafts.status = 'submitted'
                   and drafts.reviewer_admin_user_id is null`,
                { replacements: { exerciseId, adminUserId }, transaction },
            );
            await sequelize.query(
                `update exercise_subtitle_drafts
                 set reviewer_admin_user_id = :adminUserId
                 where exercise_id = :exerciseId
                   and status = 'submitted'
                   and reviewer_admin_user_id is null`,
                { replacements: { exerciseId, adminUserId }, transaction },
            );
            // 课程编辑权限由“课程分配”派生，工作流负责人配置也要保留该兼容授权。
            await sequelize.query(
                `insert into exercise_contributor_assignments (exercise_id, admin_user_id)
                 values (:exerciseId, :adminUserId)
                 on duplicate key update admin_user_id = values(admin_user_id)`,
                { replacements: { exerciseId, adminUserId }, transaction },
            );
        }
        if (adminUserId === null && previousAssigneeId > 0) {
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id = :exerciseId and admin_user_id in (:adminUserIds)`,
                { replacements: { exerciseId, adminUserIds: [...new Set([previousProofreaderId, previousReviewerId].filter((id) => id > 0))] }, transaction },
            );
        } else if (adminUserId !== previousProofreaderId && previousProofreaderId > 0 && previousProofreaderId !== previousReviewerId) {
            // 校对负责人拥有的编辑权限由该负责人派生；取消或改派后清理旧权限。
            // 若同一人仍担任二审负责人，则保留其课程访问权，确保审核任务不中断。
            await sequelize.query(
                `delete from exercise_contributor_assignments
                 where exercise_id = :exerciseId and admin_user_id = :previousProofreaderId`,
                { replacements: { exerciseId, previousProofreaderId }, transaction },
            );
        }
        if (previousAssigneeId !== (adminUserId ?? 0)) {
            if (previousAssigneeId > 0) {
                await recordWorkflowActivity({
                    eventType: 'workflow_unassigned',
                    actorAdminUserId,
                    targetAdminUserId: previousAssigneeId,
                    exerciseId,
                    workflowRole,
                }, transaction);
            }
            if (adminUserId !== null) {
                await recordWorkflowActivity({
                    eventType: 'workflow_assigned',
                    actorAdminUserId,
                    targetAdminUserId: adminUserId,
                    exerciseId,
                    workflowRole,
                }, transaction);
            }
        }
    });
    return adminUserId;
}
