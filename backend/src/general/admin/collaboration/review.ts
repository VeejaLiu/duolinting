import type { CreateTranscriptLineRequest } from '../../../domain';
import { doRawQuery } from '../../../models';
import type { SubtitleDraftStatus } from '../../../domain';
import { sequelize } from '../../../models/db-config-mysql';
import { QueryTypes } from 'sequelize';
import { getWorkflowSubmissionAssignees } from './permissions';
import { clearClaimDeadline } from './policy';
import { recordSubtitleVersion } from './audit';
import { recordWorkflowActivity } from './audit';
import { claimExpiryExpression } from './policy';
import type { SubtitleDraftRow } from './drafts';
import { parseSubtitleDraftLines } from './drafts';

/** 提交将同一份工作稿锁定为待审核版本；再次修改必须先被管理员退回。 */
export async function submitSubtitleDraft({
    exerciseId,
    adminId,
    lines,
}: {
    exerciseId: number;
    adminId: number;
    lines: CreateTranscriptLineRequest[];
}) {
    const existing = await doRawQuery<{ status: SubtitleDraftStatus }>({
        query: `select status from exercise_subtitle_drafts
                where exercise_id = :exerciseId and admin_user_id = :adminId limit 1`,
        params: { exerciseId, adminId },
    });
    if (existing[0]?.status === 'submitted') {
        throw new Error('该字幕稿已在审核队列中，不能重复提交');
    }
    if (existing[0]?.status === 'approved') {
        throw new Error('该字幕稿已审核通过并发布，不能重复提交');
    }
    await sequelize.transaction(async (transaction) => {
        const assignees = await getWorkflowSubmissionAssignees(exerciseId);
        if (assignees.proofreaderId !== adminId) {
            throw new Error('只有本课程指定的校对人员可以提交审核');
        }
        const [exercise] = await sequelize.query<{ status: string; audio_url: string }>(
            'select status,audio_url from exercises where id = :exerciseId limit 1 for update',
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        if (!exercise) throw new Error('课程不存在');
        const [currentDraft] = await sequelize.query<{ status: string }>('select status from exercise_subtitle_drafts where exercise_id=:exerciseId and admin_user_id=:adminId for update', { replacements: { exerciseId, adminId }, type: QueryTypes.SELECT, transaction });
        if (currentDraft?.status === 'submitted' || currentDraft?.status === 'approved') throw new Error('该字幕稿已提交或审核通过');
        await sequelize.query(
            `insert into exercise_subtitle_drafts
           (exercise_id, admin_user_id, reviewer_admin_user_id, transcript_json, status, review_note, submitted_at, reviewed_at, reviewed_by_admin_user_id)
         values (:exerciseId, :adminId, :reviewerId, cast(:transcriptJson as json), 'submitted', null, current_timestamp, null, null)
         on duplicate key update
           transcript_json = values(transcript_json),
           reviewer_admin_user_id = values(reviewer_admin_user_id),
           status = 'submitted',
           review_note = null,
           submitted_at = current_timestamp,
           reviewed_at = null,
           reviewed_by_admin_user_id = null,
           updated_at = current_timestamp`,
            {
                replacements: {
                    exerciseId,
                    adminId,
                    reviewerId: assignees.reviewerId,
                    transcriptJson: JSON.stringify(lines),
                },
                transaction,
            },
        );
        // 首次制课从草稿进入待审核；已发布课程有新投稿时保持发布，
        // 让普通学习者继续使用稳定的正式版本。
        if (exercise.status === 'draft') {
            await sequelize.query(
                `update exercises set status = 'proofread', updated_at = current_timestamp
                 where id = :exerciseId`,
                { replacements: { exerciseId }, transaction },
            );
        }
        // 提交后停止计时：任务进入二审，不再回到任务池。
        await clearClaimDeadline(exerciseId, adminId, transaction);
        // 使用投稿行的确定 ID 创建通知，确保一份投稿只给其提交时的审核人一条待办。
        await sequelize.query(
            `insert into admin_workflow_notifications
               (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
             select :reviewerId, :adminId, :exerciseId, id, 'subtitle_submitted'
             from exercise_subtitle_drafts
             where exercise_id = :exerciseId and admin_user_id = :adminId`,
            {
                replacements: { exerciseId, adminId, reviewerId: assignees.reviewerId },
                transaction,
            },
        );
        const [draft] = await sequelize.query<{ id: number | string }>(
            `select id from exercise_subtitle_drafts
             where exercise_id = :exerciseId and admin_user_id = :adminId limit 1`,
            { replacements: { exerciseId, adminId }, type: QueryTypes.SELECT, transaction },
        );
        if (!draft) {
            throw new Error('字幕稿保存后无法读取');
        }
        // 提交是版本历史的关键节点之一，留档便于后续校对者回溯每一版。
        await recordSubtitleVersion({
            exerciseId,
            subtitleDraftId: Number(draft.id),
            source: 'submitted',
            adminUserId: adminId,
            transcriptLines: lines,
        }, transaction);
        await recordWorkflowActivity({
            eventType: 'subtitle_submitted',
            actorAdminUserId: adminId,
            targetAdminUserId: assignees.reviewerId,
            exerciseId,
            subtitleDraftId: Number(draft.id),
            workflowRole: 'proofreader',
        }, transaction);
    });
}

export async function returnSubtitleDraft({
    draftId,
    reviewerId,
    reviewNote,
}: {
    draftId: number;
    reviewerId: number;
    reviewNote: string;
}) {
    await sequelize.transaction(async (transaction) => {
        const rows = await sequelize.query<{
            exercise_id: number | string;
            admin_user_id: number | string;
            reviewer_admin_user_id: number | string | null;
        }>(
            `select exercise_id, admin_user_id, reviewer_admin_user_id
             from exercise_subtitle_drafts where id = :draftId and status = 'submitted' limit 1`,
            { replacements: { draftId }, type: QueryTypes.SELECT, transaction },
        );
        const draft = rows[0];
        if (!draft || Number(draft.reviewer_admin_user_id) !== reviewerId) {
            throw new Error('这份字幕稿已不在你的待审核队列中');
        }
        const [, metadata] = await sequelize.query(
            `update exercise_subtitle_drafts
             set status = 'returned', review_note = :reviewNote, reviewed_at = current_timestamp,
                 reviewed_by_admin_user_id = :reviewerId
             where id = :draftId and status = 'submitted'`,
            { replacements: { draftId, reviewerId, reviewNote }, transaction },
        );
        if ((metadata as { affectedRows?: number }).affectedRows === 0) {
            throw new Error('这份字幕稿已不在待审核队列中');
        }

        await sequelize.query(
            `insert into admin_workflow_notifications
               (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type, review_note)
             values (:recipientId, :reviewerId, :exerciseId, :draftId, 'subtitle_returned', :reviewNote)`,
            {
                replacements: {
                    recipientId: Number(draft.admin_user_id), reviewerId,
                    exerciseId: Number(draft.exercise_id), draftId, reviewNote,
                },
                transaction,
            },
        );
        await recordWorkflowActivity({
            eventType: 'subtitle_returned',
            actorAdminUserId: reviewerId,
            targetAdminUserId: Number(draft.admin_user_id),
            exerciseId: Number(draft.exercise_id),
            subtitleDraftId: draftId,
            workflowRole: 'second_reviewer',
            reviewNote,
        }, transaction);

        // 退回后重新开始校对计时：给投稿人一个新的 48 小时滑动窗口。
        await sequelize.query(
            `update exercise_workflow_assignees
             set claim_expires_at = ${claimExpiryExpression()}, expiring_notified_at = null
             where exercise_id = :exerciseId and workflow_role = 'proofreader' and admin_user_id = :adminId`,
            { replacements: { exerciseId: Number(draft.exercise_id), adminId: Number(draft.admin_user_id) }, transaction },
        );

        // 初次制课若所有投稿都退回，课程回到草稿；已发布课程则始终保留发布状态。
        await sequelize.query(
            `update exercises course
             set course.status = 'draft', course.updated_at = current_timestamp
             where course.status = 'proofread'
               and course.id = (
                 select draft.exercise_id from exercise_subtitle_drafts draft where draft.id = :draftId
               )
               and not exists (
                 select 1 from exercise_subtitle_drafts remaining
                 where remaining.exercise_id = course.id and remaining.status = 'submitted'
               )`,
            { replacements: { draftId }, transaction },
        );
    });
}

/** 仅在二次审核通过时替换课程正式字幕，保持事务内状态和署名同步。 */
export async function approveSubtitleDraft({
    draftId,
    reviewerId,
}: {
    draftId: number;
    reviewerId: number;
}) {
    await sequelize.transaction(async (transaction) => {
        const rows = await sequelize.query<SubtitleDraftRow>(
            `select drafts.id, drafts.exercise_id, drafts.admin_user_id, drafts.reviewer_admin_user_id, admins.display_name,
                    drafts.transcript_json, drafts.status, drafts.review_note,
                    drafts.submitted_at, drafts.updated_at
             from exercise_subtitle_drafts drafts
             inner join admin_users admins on admins.id = drafts.admin_user_id
             where drafts.id = :draftId and drafts.status = 'submitted'
             limit 1`,
            { replacements: { draftId }, type: QueryTypes.SELECT, transaction },
        );
        const draft = rows[0];
        if (!draft) throw new Error('这份字幕稿已不在待审核队列中');
        if (Number(draft.reviewer_admin_user_id) !== reviewerId) {
            throw new Error('这份字幕稿已不在你的待审核队列中');
        }

        const [exerciseRows] = await sequelize.query<{ id: number | string; audio_url: string }>(
            'select id,audio_url from exercises where id = :exerciseId limit 1 for update',
            { replacements: { exerciseId: Number(draft.exercise_id) }, type: QueryTypes.SELECT, transaction },
        );
        if (!exerciseRows) throw new Error('课程不存在');

        await sequelize.query(
            `update exercises
             set transcript_json = cast(:transcriptJson as json), status = 'published', updated_at = current_timestamp
             where id = :exerciseId`,
            {
                replacements: {
                    exerciseId: Number(draft.exercise_id),
                    transcriptJson: JSON.stringify(parseSubtitleDraftLines(draft.transcript_json)),
                },
                transaction,
            },
        );
        await sequelize.query(
            `update exercise_subtitle_drafts
             set status = 'approved', review_note = null, reviewed_at = current_timestamp,
                 reviewed_by_admin_user_id = :reviewerId
             where id = :draftId`,
            { replacements: { draftId, reviewerId }, transaction },
        );
        // 已发布：校对计时结束，课程不再进入任务池。
        await clearClaimDeadline(Number(draft.exercise_id), Number(draft.admin_user_id), transaction);
        await sequelize.query(
            `insert into exercise_contributions (exercise_id, admin_user_id, contribution_role)
             values (:exerciseId, :adminId, :role)
             on duplicate key update admin_user_id = values(admin_user_id), updated_at = current_timestamp`,
            {
                replacements: {
                    exerciseId: Number(draft.exercise_id),
                    adminId: Number(draft.admin_user_id),
                    role: 'proofreader',
                },
                transaction,
            },
        );
        await sequelize.query(
            `insert into exercise_contributions (exercise_id, admin_user_id, contribution_role)
             values (:exerciseId, :adminId, :role)
             on duplicate key update admin_user_id = values(admin_user_id), updated_at = current_timestamp`,
            {
                replacements: {
                    exerciseId: Number(draft.exercise_id),
                    adminId: reviewerId,
                    role: 'second_reviewer',
                },
                transaction,
            },
        );
        await sequelize.query(
            `insert into admin_workflow_notifications
               (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id, notification_type)
             values (:recipientId, :reviewerId, :exerciseId, :draftId, 'subtitle_approved')`,
            {
                replacements: {
                    recipientId: Number(draft.admin_user_id), reviewerId,
                    exerciseId: Number(draft.exercise_id), draftId,
                },
                transaction,
            },
        );
        // 审核通过是正式发布版本，单独留档，作为"被采纳版本"的证据。
        await recordSubtitleVersion({
            exerciseId: Number(draft.exercise_id),
            subtitleDraftId: draftId,
            source: 'approved',
            adminUserId: Number(draft.admin_user_id),
            transcriptLines: parseSubtitleDraftLines(draft.transcript_json),
        }, transaction);
        await recordWorkflowActivity({
            eventType: 'subtitle_approved',
            actorAdminUserId: reviewerId,
            targetAdminUserId: Number(draft.admin_user_id),
            exerciseId: Number(draft.exercise_id),
            subtitleDraftId: draftId,
            workflowRole: 'second_reviewer',
        }, transaction);
    });
}

/**
 * 把已发布课程回退到草稿，重新进入校对流程。
 * - 保留现有正式字幕作为下一次校对起点；
 * - 清空校对/二审负责人，课程回到任务池，任何贡献者都可重新领取；
 * - 回退动作作为一条 reverted 版本快照 + 协作动态事件留档，理由必填。
 */
export async function revertPublishedSubtitle({
    exerciseId,
    adminId,
    reason,
}: {
    exerciseId: number;
    adminId: number;
    reason: string;
}) {
    const normalizedReason = String(reason ?? '').trim();
    if (!normalizedReason) {
        throw new Error('请填写回退理由');
    }

    await sequelize.transaction(async (transaction) => {
        const [exercise] = await sequelize.query<{ status: string; transcript_json: unknown }>(
            `select status, transcript_json from exercises where id = :exerciseId limit 1 for update`,
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        if (!exercise) {
            throw new Error('课程不存在');
        }
        if (exercise.status !== 'published') {
            throw new Error('只有已发布的课程可以回退到草稿');
        }

        // 最近一次已通过的投稿，作为"被回退版本"的作者与证据来源。
        const [approvedDraft] = await sequelize.query<{
            id: number | string;
            admin_user_id: number | string;
            reviewed_by_admin_user_id: number | string | null;
        }>(
            `select id, admin_user_id, reviewed_by_admin_user_id from exercise_subtitle_drafts
             where exercise_id = :exerciseId and status = 'approved'
             order by reviewed_at desc, id desc limit 1`,
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );

        // 先快照被回退时的正式字幕：这就是回退动作本身留下的证据。
        await recordSubtitleVersion({
            exerciseId,
            subtitleDraftId: approvedDraft ? Number(approvedDraft.id) : null,
            source: 'reverted',
            adminUserId: adminId,
            transcriptLines: parseSubtitleDraftLines(exercise.transcript_json),
            note: normalizedReason,
        }, transaction);

        // 课程回到草稿，保留现有字幕；重新开放自助领取。
        await sequelize.query(
            `update exercises
             set status = 'draft', claim_blocked = false, updated_at = current_timestamp
             where id = :exerciseId`,
            { replacements: { exerciseId }, transaction },
        );

        // 清空负责人，让课程重新进入任务池（任何人可领取）。
        await sequelize.query(
            `delete from exercise_workflow_assignees
             where exercise_id = :exerciseId and workflow_role in ('proofreader', 'second_reviewer')`,
            { replacements: { exerciseId }, transaction },
        );
        await sequelize.query(
            `delete from exercise_contributor_assignments where exercise_id = :exerciseId`,
            { replacements: { exerciseId }, transaction },
        );

        const proofreaderId = approvedDraft ? Number(approvedDraft.admin_user_id) : null;
        const secondReviewerId = approvedDraft?.reviewed_by_admin_user_id
            ? Number(approvedDraft.reviewed_by_admin_user_id)
            : null;
        // 原校对人与原二审人都需要收到持久化站内通知；去重避免异常历史数据产生重复提醒。
        const notificationRecipientIds = [...new Set([proofreaderId, secondReviewerId].filter(
            (recipientId): recipientId is number => recipientId !== null,
        ))];
        for (const recipientId of notificationRecipientIds) {
            await sequelize.query(
                `insert into admin_workflow_notifications
                   (recipient_admin_user_id, actor_admin_user_id, exercise_id, subtitle_draft_id,
                    notification_type, review_note)
                 values (:recipientId, :adminId, :exerciseId, :draftId, 'subtitle_reverted', :reason)`,
                {
                    replacements: {
                        recipientId,
                        adminId,
                        exerciseId,
                        draftId: approvedDraft ? Number(approvedDraft.id) : null,
                        reason: normalizedReason,
                    },
                    transaction,
                },
            );
        }

        await recordWorkflowActivity({
            eventType: 'subtitle_reverted',
            actorAdminUserId: adminId,
            targetAdminUserId: proofreaderId,
            secondReviewerAdminUserId: secondReviewerId,
            exerciseId,
            subtitleDraftId: approvedDraft ? Number(approvedDraft.id) : null,
            workflowRole: 'proofreader',
            reviewNote: normalizedReason,
        }, transaction);
    });
}
