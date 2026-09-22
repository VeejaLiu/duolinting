import type { AdminWorkflowNotificationType } from '../../../domain';
import type { AdminReviewTask } from '../../../domain';
import { doRawQuery } from '../../../models';
import { parseWorkflowLocalizations } from '.././workflow-localizations';
import type { AdminSubtitleWorkflowTaskInbox } from '../../../domain';
import type { CourseWorkflowAssignmentSource } from '../../../domain';
import type { SubtitleDraftStatus } from '../../../domain';
import type { AdminWorkflowNotifications } from '../../../domain';
import { sequelize } from '../../../models/db-config-mysql';
import { isClaimWindowActive } from './policy';

type WorkflowNotificationRow = {
    id: number | string;
    notification_type: AdminWorkflowNotificationType;
    exercise_id: number | string;
    exercise_title: string;
    exercise_localizations: unknown;
    actor_display_name: string | null;
    review_note: string | null;
    is_read: boolean | number;
    created_at: Date | string;
};

/** 审核人只看到提交时已指派给自己的待审稿，避免管理员改人后任务漂移。 */
export async function listMySubtitleReviewTasks(adminId: number): Promise<AdminReviewTask[]> {
    const rows = await doRawQuery<{
        draft_id: number | string;
        exercise_id: number | string;
        exercise_title: string;
    exercise_localizations: unknown;
        contributor_display_name: string;
        submitted_at: Date | string;
    }>({
        query: `select drafts.id as draft_id, drafts.exercise_id, exercises.title as exercise_title, exercises.localizations_json as exercise_localizations,
                       contributors.display_name as contributor_display_name, drafts.submitted_at
                from exercise_subtitle_drafts drafts
                inner join exercises on exercises.id = drafts.exercise_id
                inner join admin_users contributors on contributors.id = drafts.admin_user_id
                where drafts.reviewer_admin_user_id = ? and drafts.status = 'submitted'
                order by drafts.submitted_at asc, drafts.id asc`,
        params: [adminId],
    });
    return rows.map((row) => ({
        draftId: Number(row.draft_id),
        exerciseId: Number(row.exercise_id),
        exerciseTitle: row.exercise_title,
            exerciseLocalizations: parseWorkflowLocalizations(row.exercise_localizations),
        contributorDisplayName: row.contributor_display_name,
        submittedAt: new Date(row.submitted_at).toISOString(),
    }));
}

/** 返回当前成员负责的校对、审核、退回和最近完成记录，供统一任务中心使用。 */
export async function listMySubtitleWorkflowInbox(adminId: number): Promise<AdminSubtitleWorkflowTaskInbox> {
    const rows = await doRawQuery<{
        draft_id: number | string;
        exercise_id: number | string;
        exercise_title: string;
    exercise_localizations: unknown;
        contributor_display_name: string;
        proofreader_id: number | string | null;
        proofreader_source: CourseWorkflowAssignmentSource | null;
        proofreader_claim_expires_at: Date | string | null;
        reviewer_snapshot_id: number | string | null;
        draft_admin_id: number | string;
        reviewed_by_admin_user_id: number | string | null;
        status: SubtitleDraftStatus;
        submitted_at: Date | string | null;
        updated_at: Date | string | null;
        review_note: string | null;
    }>({
        query: `select drafts.id as draft_id, drafts.exercise_id, exercises.title as exercise_title, exercises.localizations_json as exercise_localizations,
                       contributors.display_name as contributor_display_name,
                       proofreader.admin_user_id as proofreader_id,
                       proofreader.assignment_source as proofreader_source,
                       proofreader.claim_expires_at as proofreader_claim_expires_at,
                       drafts.admin_user_id as draft_admin_id,
                       drafts.reviewer_admin_user_id as reviewer_snapshot_id,
                       drafts.reviewed_by_admin_user_id,
                       drafts.status,
                       drafts.submitted_at, drafts.updated_at, drafts.review_note
                from exercise_subtitle_drafts drafts
                inner join exercises on exercises.id = drafts.exercise_id
                inner join admin_users contributors on contributors.id = drafts.admin_user_id
                left join exercise_workflow_assignees proofreader
                  on proofreader.exercise_id = drafts.exercise_id and proofreader.workflow_role = 'proofreader'
                left join exercise_workflow_assignees reviewer
                  on reviewer.exercise_id = drafts.exercise_id and reviewer.workflow_role = 'second_reviewer'
                where (drafts.admin_user_id = :adminId
                       or drafts.reviewer_admin_user_id = :adminId
                       or drafts.reviewed_by_admin_user_id = :adminId)
                  and drafts.status in ('editing', 'submitted', 'returned', 'approved')
                order by drafts.updated_at desc, drafts.id desc
                limit 100`,
        params: { adminId },
    });
    const items: AdminSubtitleWorkflowTaskInbox['items'] = [];
    for (const row of rows) {
        const base = {
            draftId: Number(row.draft_id), exerciseId: Number(row.exercise_id), exerciseTitle: row.exercise_title,
            exerciseLocalizations: parseWorkflowLocalizations(row.exercise_localizations),
            contributorDisplayName: row.contributor_display_name,
            submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
            reviewNote: row.review_note || undefined,
            assignmentSource: row.proofreader_source || undefined,
            claimExpiresAt: row.proofreader_claim_expires_at ? new Date(row.proofreader_claim_expires_at).toISOString() : undefined,
        };
        const proofreaderClaimActive = Number(row.proofreader_id) === adminId
            && isClaimWindowActive(row.proofreader_claim_expires_at);
        // 进行中的校对/退回任务只归属于实际投稿人，且校对人必须是当前负责人。
        if (Number(row.draft_admin_id) === adminId && proofreaderClaimActive && (row.status === 'editing' || row.status === 'returned')) {
            items.push({ ...base, role: 'proofreader', stage: row.status === 'returned' ? 'returned' : 'proofreading', draftStatus: row.status });
        }
        // 投稿提交时保存 reviewer 快照；之后重新分配负责人也不会把待审核任务漂移给别人。
        if (Number(row.reviewer_snapshot_id) === adminId && row.status === 'submitted') {
            items.push({ ...base, role: 'second_reviewer', stage: 'awaiting_review', draftStatus: row.status });
        }
        // 已完成记录按历史署名归属，不依据当前负责人推断，避免账号/负责人变更造成错配。
        if (row.status === 'approved' && Number(row.draft_admin_id) === adminId) {
            items.push({ ...base, role: 'proofreader', stage: 'completed', draftStatus: row.status });
        }
        if (row.status === 'approved' && Number(row.reviewed_by_admin_user_id) === adminId) {
            items.push({ ...base, role: 'second_reviewer', stage: 'completed', draftStatus: row.status });
        }
    }
    // 负责人刚被分配、尚未保存第一版个人草稿时，仍应在任务中心看到“待校对”。
    // 使用 draftId=0 作为尚未创建稿件的占位任务，点击课程列表即可进入编辑器。
    const unstartedRows = await doRawQuery<{
        exercise_id: number | string;
        exercise_title: string;
    exercise_localizations: unknown;
        assignment_source: CourseWorkflowAssignmentSource;
        claim_expires_at: Date | string | null;
    }>({
        query: `select assignees.exercise_id, exercises.title as exercise_title, exercises.localizations_json as exercise_localizations,
                       assignees.assignment_source, assignees.claim_expires_at
                from exercise_workflow_assignees assignees
                inner join exercises on exercises.id = assignees.exercise_id
                where assignees.workflow_role = 'proofreader'
                  and assignees.admin_user_id = :adminId
                  and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())
                  and not exists (
                    select 1 from exercise_subtitle_drafts drafts
                    where drafts.exercise_id = assignees.exercise_id
                      and drafts.admin_user_id = :adminId
                  )
                order by assignees.updated_at desc, assignees.exercise_id desc
                limit 100`,
        params: { adminId },
    });
    for (const row of unstartedRows) {
        items.push({
            draftId: 0,
            exerciseId: Number(row.exercise_id),
            exerciseTitle: row.exercise_title,
            exerciseLocalizations: parseWorkflowLocalizations(row.exercise_localizations),
            contributorDisplayName: '尚未创建校对稿',
            role: 'proofreader',
            stage: 'proofreading',
            draftStatus: 'editing',
            assignmentSource: row.assignment_source,
            claimExpiresAt: row.claim_expires_at ? new Date(row.claim_expires_at).toISOString() : undefined,
        });
    }
    return {
        items,
        counts: {
            proofreading: items.filter((item) => item.stage === 'proofreading').length,
            awaitingReview: items.filter((item) => item.stage === 'awaiting_review').length,
            returned: items.filter((item) => item.stage === 'returned').length,
            completedProofreading: items.filter((item) => item.stage === 'completed' && item.role === 'proofreader').length,
            completedSecondReview: items.filter((item) => item.stage === 'completed' && item.role === 'second_reviewer').length,
        },
    };
}

export async function listMyWorkflowNotifications(adminId: number): Promise<AdminWorkflowNotifications> {
    const rows = await doRawQuery<WorkflowNotificationRow>({
        query: `select notifications.id, notifications.notification_type, notifications.exercise_id,
                       exercises.title as exercise_title, exercises.localizations_json as exercise_localizations, actors.display_name as actor_display_name,
                       notifications.review_note, notifications.is_read, notifications.created_at
                from admin_workflow_notifications notifications
                inner join exercises on exercises.id = notifications.exercise_id
                left join admin_users actors on actors.id = notifications.actor_admin_user_id
                where notifications.recipient_admin_user_id = ?
                order by notifications.created_at desc, notifications.id desc
                limit 50`,
        params: [adminId],
    });
    const unreadRows = await doRawQuery<{ total: number | string }>({
        query: `select count(*) as total from admin_workflow_notifications
                where recipient_admin_user_id = ? and is_read = false`,
        params: [adminId],
    });
    return {
        unreadCount: Number(unreadRows[0]?.total ?? 0),
        items: rows.map((row) => ({
            id: Number(row.id), type: row.notification_type,
            exerciseId: Number(row.exercise_id), exerciseTitle: row.exercise_title,
            exerciseLocalizations: parseWorkflowLocalizations(row.exercise_localizations),
            actorDisplayName: row.actor_display_name || '系统', reviewNote: row.review_note || undefined,
            isRead: Boolean(row.is_read), createdAt: new Date(row.created_at).toISOString(),
        })),
    };
}

export async function markMyWorkflowNotificationsRead(adminId: number, notificationIds?: number[]) {
    const ids = [...new Set((notificationIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];
    await sequelize.query(
        `update admin_workflow_notifications set is_read = true
         where recipient_admin_user_id = :adminId${ids.length ? ' and id in (:ids)' : ''}`,
        { replacements: ids.length ? { adminId, ids } : { adminId } },
    );
}
