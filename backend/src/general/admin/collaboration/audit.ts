import type { AdminWorkflowActivityType } from '../../../domain';
import type { CourseContributionRole } from '../../../domain';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../../models/db-config-mysql';
import type { SubtitleVersionSource } from '../../../domain';
import type { TranscriptLine } from '../../../domain';
import { QueryTypes } from 'sequelize';
import type { ExerciseSubtitleVersion } from '../../../domain';
import { doRawQuery } from '../../../models';
import type { CourseWorkflowCredits } from '../../../domain';
import type { AdminWorkflowActivityPage } from '../../../domain';
import type { AdminWorkflowActivity } from '../../../domain';
import { parseWorkflowLocalizations } from '.././workflow-localizations';
import { parseSubtitleDraftLines } from './drafts';

type WorkflowActivityEventInput = {
    eventType: AdminWorkflowActivityType;
    actorAdminUserId?: number | null;
    targetAdminUserId?: number | null;
    secondReviewerAdminUserId?: number | null;
    exerciseId: number;
    subtitleDraftId?: number | null;
    workflowRole?: CourseContributionRole | null;
    reviewNote?: string | null;
};

/**
 * 协作动态是审计记录而不是可变的任务状态：每个关键动作只插入一行，
 * 与原业务写入共用 transaction，因此不会出现“任务已完成但团队动态缺失”。
 */
export async function recordWorkflowActivity(
    event: WorkflowActivityEventInput,
    transaction: Transaction,
) {
    await sequelize.query(
        `insert into admin_workflow_activity_events
           (event_type, actor_admin_user_id, target_admin_user_id, second_reviewer_admin_user_id, exercise_id,
            subtitle_draft_id, workflow_role, review_note)
         values (:eventType, :actorAdminUserId, :targetAdminUserId, :secondReviewerAdminUserId, :exerciseId,
                 :subtitleDraftId, :workflowRole, :reviewNote)`,
        {
            replacements: {
                eventType: event.eventType,
                actorAdminUserId: event.actorAdminUserId ?? null,
                targetAdminUserId: event.targetAdminUserId ?? null,
                secondReviewerAdminUserId: event.secondReviewerAdminUserId ?? null,
                exerciseId: event.exerciseId,
                subtitleDraftId: event.subtitleDraftId ?? null,
                workflowRole: event.workflowRole ?? null,
                reviewNote: event.reviewNote ?? null,
            },
            transaction,
        },
    );
}

/**
 * 追加一条字幕版本快照。版本号按课程内单调递增，只追加、不覆盖，
 * 与协作事件、通知共用同一事务，保证"有版本就有对应动态"。
 */
export async function recordSubtitleVersion(
    params: {
        exerciseId: number;
        subtitleDraftId?: number | null;
        source: SubtitleVersionSource;
        adminUserId: number;
        transcriptLines: TranscriptLine[];
        note?: string | null;
    },
    transaction: Transaction,
) {
    const [maxRow] = await sequelize.query<{ next_no: number | string }>(
        `select coalesce(max(version_no), 0) + 1 as next_no
         from exercise_subtitle_versions where exercise_id = :exerciseId`,
        { replacements: { exerciseId: params.exerciseId }, type: QueryTypes.SELECT, transaction },
    );
    const versionNo = Number(maxRow?.next_no ?? 1);
    await sequelize.query(
        `insert into exercise_subtitle_versions
           (exercise_id, subtitle_draft_id, version_no, transcript_json, source, admin_user_id, note)
         values (:exerciseId, :subtitleDraftId, :versionNo, cast(:transcriptJson as json), :source, :adminUserId, :note)`,
        {
            replacements: {
                exerciseId: params.exerciseId,
                subtitleDraftId: params.subtitleDraftId ?? null,
                versionNo,
                transcriptJson: JSON.stringify(params.transcriptLines),
                source: params.source,
                adminUserId: params.adminUserId,
                note: params.note ?? null,
            },
            transaction,
        },
    );
}

/** 某门课程的字幕版本历史，按版本号倒序，供管理员与贡献者回溯每一版。 */
export async function listExerciseSubtitleVersions(exerciseId: number): Promise<ExerciseSubtitleVersion[]> {
    const rows = await doRawQuery<{
        id: number | string;
        exercise_id: number | string;
        subtitle_draft_id: number | string | null;
        version_no: number | string;
        transcript_json: unknown;
        source: SubtitleVersionSource;
        admin_user_id: number | string;
        display_name: string | null;
        note: string | null;
        created_at: Date | string;
    }>({
        query: `select versions.id, versions.exercise_id, versions.subtitle_draft_id,
                       versions.version_no, versions.transcript_json, versions.source,
                       versions.admin_user_id, admins.display_name, versions.note, versions.created_at
                from exercise_subtitle_versions versions
                left join admin_users admins on admins.id = versions.admin_user_id
                where versions.exercise_id = :exerciseId
                order by versions.version_no desc, versions.id desc`,
        params: { exerciseId },
    });
    return rows.map((row) => ({
        id: Number(row.id),
        exerciseId: Number(row.exercise_id),
        subtitleDraftId: row.subtitle_draft_id ? Number(row.subtitle_draft_id) : undefined,
        versionNo: Number(row.version_no),
        lines: parseSubtitleDraftLines(row.transcript_json),
        source: row.source,
        adminUserId: Number(row.admin_user_id),
        adminDisplayName: row.display_name || '系统',
        note: row.note || undefined,
        createdAt: new Date(row.created_at).toISOString(),
    }));
}

type WorkflowActivityRow = {
    id: number | string;
    event_type: AdminWorkflowActivityType;
    actor_admin_user_id: number | string | null;
    target_admin_user_id: number | string | null;
    second_reviewer_admin_user_id: number | string | null;
    exercise_id: number | string;
    exercise_title: string;
    exercise_localizations: unknown;
    actor_display_name: string | null;
    target_display_name: string | null;
    second_reviewer_display_name: string | null;
    subtitle_draft_id: number | string | null;
    workflow_role: CourseContributionRole | null;
    review_note: string | null;
    occurred_at: Date | string;
};

/**
 * 团队动态向所有已登录后台成员开放。响应附带操作者与接收者的内部 ID，
 * 仅用于客户端高亮当前成员的关联记录，界面仍只展示名称。
 */
export async function listWorkflowActivity({
    page = 1,
    pageSize = 50,
    memberId,
    eventType,
}: {
    page?: number;
    pageSize?: number;
    memberId?: number;
    eventType?: AdminWorkflowActivityType;
} = {}): Promise<AdminWorkflowActivityPage> {
    const resolvedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const resolvedPageSize = Number.isInteger(pageSize)
        ? Math.min(Math.max(pageSize, 10), 100)
        : 50;
    const normalizedMemberId = Number.isInteger(memberId) && (memberId ?? 0) > 0
        ? memberId
        : undefined;
    const filters: string[] = [];
    const params: Record<string, number | string> = {
        limit: resolvedPageSize,
        offset: (resolvedPage - 1) * resolvedPageSize,
    };
    if (normalizedMemberId) {
        filters.push(`(events.actor_admin_user_id = :memberId
            or events.target_admin_user_id = :memberId
            or events.second_reviewer_admin_user_id = :memberId)`);
        params.memberId = normalizedMemberId;
    }
    if (eventType) {
        filters.push('events.event_type = :eventType');
        params.eventType = eventType;
    }
    const whereClause = filters.length ? `where ${filters.join(' and ')}` : '';
    const [rows, totalRows] = await Promise.all([
        doRawQuery<WorkflowActivityRow>({
            query: `select events.id, events.event_type, events.actor_admin_user_id, events.target_admin_user_id,
                           events.second_reviewer_admin_user_id,
                           events.exercise_id,
                           coalesce(exercises.title, concat('已删除课程 #', events.exercise_id)) as exercise_title,
                           exercises.localizations_json as exercise_localizations,
                           actor.display_name as actor_display_name,
                           target.display_name as target_display_name,
                           second_reviewer.display_name as second_reviewer_display_name,
                           events.subtitle_draft_id, events.workflow_role, events.review_note, events.occurred_at
                    from admin_workflow_activity_events events
                    left join exercises on exercises.id = events.exercise_id
                    left join admin_users actor on actor.id = events.actor_admin_user_id
                    left join admin_users target on target.id = events.target_admin_user_id
                    left join admin_users second_reviewer on second_reviewer.id = events.second_reviewer_admin_user_id
                    ${whereClause}
                    order by events.occurred_at desc, events.id desc
                    limit :limit offset :offset`,
            params,
        }),
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total from admin_workflow_activity_events events ${whereClause}`,
            params: normalizedMemberId || eventType
                ? Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'limit' && key !== 'offset'))
                : {},
        }),
    ]);

    const items: AdminWorkflowActivity[] = rows.map((row) => ({
        id: Number(row.id),
        type: row.event_type,
        exerciseId: Number(row.exercise_id),
        exerciseTitle: row.exercise_title,
            exerciseLocalizations: parseWorkflowLocalizations(row.exercise_localizations),
        actorAdminUserId: row.actor_admin_user_id === null ? undefined : Number(row.actor_admin_user_id),
        targetAdminUserId: row.target_admin_user_id === null ? undefined : Number(row.target_admin_user_id),
        secondReviewerAdminUserId: row.second_reviewer_admin_user_id === null
            ? undefined
            : Number(row.second_reviewer_admin_user_id),
        actorDisplayName: row.actor_display_name || undefined,
        targetDisplayName: row.target_display_name || undefined,
        secondReviewerDisplayName: row.second_reviewer_display_name || undefined,
        workflowRole: row.workflow_role || undefined,
        subtitleDraftId: row.subtitle_draft_id === null ? undefined : Number(row.subtitle_draft_id),
        reviewNote: row.review_note || undefined,
        occurredAt: new Date(row.occurred_at).toISOString(),
    }));
    return {
        items,
        page: resolvedPage,
        pageSize: resolvedPageSize,
        total: Number(totalRows[0]?.total ?? 0),
    };
}

export async function recordExerciseContribution({
    exerciseId,
    adminId,
    role,
}: {
    exerciseId: number;
    adminId: number;
    role: CourseContributionRole;
}) {
    await sequelize.query(
        `insert into exercise_contributions (exercise_id, admin_user_id, contribution_role)
         values (:exerciseId, :adminId, :role)
         on duplicate key update admin_user_id = values(admin_user_id), updated_at = current_timestamp`,
        { replacements: { exerciseId, adminId, role } },
    );
}

export async function listExerciseContributors(exerciseId: number) {
    const rows = await doRawQuery<{
        display_name: string;
        contribution_role: CourseContributionRole;
    }>({
        query: `
            select admin_users.display_name, exercise_contributions.contribution_role
            from exercise_contributions
            inner join admin_users on admin_users.id = exercise_contributions.admin_user_id
            where exercise_contributions.exercise_id = ?
            order by field(exercise_contributions.contribution_role, 'proofreader', 'second_reviewer')
        `,
        params: [exerciseId],
    });
    const byName = new Map<string, CourseContributionRole[]>();
    for (const row of rows) {
        byName.set(row.display_name, [...(byName.get(row.display_name) ?? []), row.contribution_role]);
    }
    return [...byName.entries()].map(([displayName, roles]) => ({ displayName, roles }));
}

/**
 * 学习端只需知道课程由谁校对、谁二审。该查询刻意只返回展示名称，
 * 不会泄露后台账号 ID、邮箱、草稿状态或审核意见。
 */
export async function getExerciseWorkflowCredits(exerciseId: number): Promise<CourseWorkflowCredits | undefined> {
    const rows = await doRawQuery<{
        workflow_role: CourseContributionRole;
        display_name: string;
    }>({
        query: `
            select assignees.workflow_role, admins.display_name
            from exercise_workflow_assignees assignees
            inner join admin_users admins on admins.id = assignees.admin_user_id
            where assignees.exercise_id = ?
        `,
        params: [exerciseId],
    });
    const credits: CourseWorkflowCredits = {};
    for (const row of rows) {
        if (row.workflow_role === 'proofreader') {
            credits.proofreaderDisplayName = row.display_name;
        }
        if (row.workflow_role === 'second_reviewer') {
            credits.secondReviewerDisplayName = row.display_name;
        }
    }
    return credits.proofreaderDisplayName || credits.secondReviewerDisplayName
        ? credits
        : undefined;
}
