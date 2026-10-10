import type { CourseWorkflowSummary } from '../../domain';
import { doRawQuery } from '../../models';
import { measureAdminListStep } from '../../lib/admin-list-performance';

type DraftRow = {
    id: number; exercise_id: number; admin_user_id: number; status: string;
    display_name: string | null; submitted_at: Date | null; updated_at: Date; review_note: string | null;
    submitted_at_json: string | null; updated_at_json: string | null;
};
type AssigneeRow = {
    exercise_id: number; workflow_role: string; admin_user_id: number; display_name: string | null;
    assignment_source: string; claim_expires_at: Date | null;
};
type CreditRow = { exercise_id: number; contribution_role: string; display_name: string | null };

type WorkflowFields = {
    pending_subtitle_draft_count: number;
    workflow_stage?: CourseWorkflowSummary['stage'];
    workflow_contributor_display_name?: string | null;
    workflow_submitted_at?: Date | null;
    workflow_review_note?: string | null;
    proofreader_display_name?: string | null;
    second_reviewer_display_name?: string | null;
    proofreader_assignee_json?: { adminUserId: number; displayName: string };
    second_reviewer_assignee_json?: { adminUserId: number; displayName: string };
    subtitle_drafts_json: unknown[];
    proofreader_assignment_source?: string;
    proofreader_claim_expires_at?: Date | null;
};

/** 只查当前页 ID，三个批量查询代替每门课的十二个相关子查询，不读取草稿正文。 */
export async function loadPageWorkflow(ids: number[]): Promise<Map<number, WorkflowFields>> {
    const result = new Map<number, WorkflowFields>();
    if (!ids.length) return result;
    const [drafts, assignees, credits] = await Promise.all([
        measureAdminListStep('workflow_drafts', () => doRawQuery<DraftRow>({
            query: `select d.id, d.exercise_id, d.admin_user_id, d.status, d.submitted_at,
                           d.updated_at, d.review_note, a.display_name,
                           date_format(d.submitted_at, '%Y-%m-%d %H:%i:%s.%f') as submitted_at_json,
                           date_format(d.updated_at, '%Y-%m-%d %H:%i:%s.%f') as updated_at_json
                    from exercise_subtitle_drafts d left join admin_users a on a.id = d.admin_user_id
                    where d.exercise_id in (:ids)`, params: { ids },
        })),
        measureAdminListStep('workflow_assignees', () => doRawQuery<AssigneeRow>({
            query: `select w.exercise_id, w.workflow_role, w.admin_user_id,
                           w.assignment_source, w.claim_expires_at, a.display_name
                    from exercise_workflow_assignees w left join admin_users a on a.id = w.admin_user_id
                    where w.exercise_id in (:ids)`, params: { ids },
        })),
        measureAdminListStep('workflow_credits', () => doRawQuery<CreditRow>({
            query: `select c.exercise_id, c.contribution_role, a.display_name
                    from exercise_contributions c left join admin_users a on a.id = c.admin_user_id
                    where c.exercise_id in (:ids)`, params: { ids },
        })),
    ]);
    const priority: Record<string, number> = { submitted: 0, returned: 1, editing: 2 };
    const timestamp = (date: Date | null) => date ? new Date(date).getTime() : 0;
    for (const id of ids) {
        const courseDrafts = drafts.filter((draft) => Number(draft.exercise_id) === id);
        // 与旧 SQL 保持相同优先级：待审 > 退回 > 编辑，同阶段取最近更新。
        const active = courseDrafts.filter((draft) => draft.status in priority).sort((a, b) =>
            priority[a.status] - priority[b.status] || timestamp(b.updated_at) - timestamp(a.updated_at));
        const submitted = courseDrafts.filter((draft) => draft.status === 'submitted')
            .sort((a, b) => timestamp(b.submitted_at) - timestamp(a.submitted_at));
        const returned = courseDrafts.filter((draft) => draft.status === 'returned')
            .sort((a, b) => timestamp(b.updated_at) - timestamp(a.updated_at));
        const fields: WorkflowFields = {
            pending_subtitle_draft_count: submitted.length,
            workflow_stage: active[0] ? ({ submitted: 'awaiting_review', returned: 'returned', editing: 'proofreading' } as const)[active[0].status as 'submitted' | 'returned' | 'editing'] : undefined,
            workflow_contributor_display_name: active.find((draft) => draft.display_name !== null)?.display_name,
            workflow_submitted_at: submitted[0]?.submitted_at,
            workflow_review_note: returned[0]?.review_note,
            // 旧 SQL 用 inner join：孤立的人员关系不产生署名，但仍计入待审数量。
            subtitle_drafts_json: courseDrafts.filter((draft) => draft.display_name !== null).map((draft) => ({
                adminUserId: Number(draft.admin_user_id), contributorDisplayName: draft.display_name,
                // 草稿摘要保留原 MySQL JSON_OBJECT 的 UTC 日期字符串格式（六位小数）。
                status: draft.status, submittedAt: draft.submitted_at_json, updatedAt: draft.updated_at_json,
                reviewNote: draft.review_note,
            })),
        };
        for (const row of assignees.filter((item) => Number(item.exercise_id) === id)) {
            const assignee = row.display_name !== null
                ? { adminUserId: Number(row.admin_user_id), displayName: row.display_name } : undefined;
            if (row.workflow_role === 'proofreader') {
                fields.proofreader_assignee_json = assignee;
                fields.proofreader_assignment_source = row.assignment_source;
                fields.proofreader_claim_expires_at = row.claim_expires_at;
            } else if (row.workflow_role === 'second_reviewer') fields.second_reviewer_assignee_json = assignee;
        }
        for (const row of credits.filter((item) => Number(item.exercise_id) === id)) {
            if (row.contribution_role === 'proofreader') fields.proofreader_display_name = row.display_name;
            else if (row.contribution_role === 'second_reviewer') fields.second_reviewer_display_name = row.display_name;
        }
        result.set(id, fields);
    }
    return result;
}
