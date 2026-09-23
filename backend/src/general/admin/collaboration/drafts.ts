import { QueryTypes } from 'sequelize';
import type { SubtitleDraftStatus } from '../../../domain';
import type { TranscriptLine } from '../../../domain';
import type { SubtitleDraft } from '../../../domain';
import { doRawQuery } from '../../../models';
import type { CreateTranscriptLineRequest } from '../../../domain';
import { sequelize } from '../../../models/db-config-mysql';
import type { AdminActor } from './policy';
import { isSuperAdmin } from './policy';
import { canReviewSubtitleDraft } from './permissions';
import { renewClaimWindow } from './policy';

export type SubtitleDraftRow = {
    id: number | string;
    exercise_id: number | string;
    admin_user_id: number | string;
    reviewer_admin_user_id?: number | string | null;
    display_name: string;
    transcript_json: unknown;
    status: SubtitleDraftStatus;
    review_note: string | null;
    submitted_at: Date | string | null;
    updated_at: Date | string | null;
};

// Keep the draft format identical to exercises.transcript_json.  This makes a
// reviewed draft safe to promote atomically without lossy client conversion.
export const parseSubtitleDraftLines = (value: unknown): TranscriptLine[] => {
    if (Array.isArray(value)) return value as TranscriptLine[];
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed as TranscriptLine[] : [];
    } catch {
        return [];
    }
};

const toSubtitleDraft = (row: SubtitleDraftRow): SubtitleDraft => ({
    id: Number(row.id),
    exerciseId: Number(row.exercise_id),
    contributorDisplayName: row.display_name,
    status: row.status,
    lines: parseSubtitleDraftLines(row.transcript_json),
    reviewNote: row.review_note || undefined,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
});

/** 贡献者只能读取自己的草稿；超级管理员只读取待二次审核的投稿。 */
export async function listExerciseSubtitleDrafts(
    exerciseId: number,
    admin: AdminActor,
    options?: { submittedOnly?: boolean },
) {
    // 管理员可以查看待审稿来安排工作；通过/退回的权限仍由路由层严格校验负责人。
    const reviewerCanSeeSubmitted = isSuperAdmin(admin)
        || await canReviewSubtitleDraft(admin, exerciseId);
    // 贡献者可能同时是本课的校对人和二审人（自助领取就是这种情况）。
    // 因此不能因为具备二审权限就只查询 submitted：否则自己的 editing/returned
    // 工作稿会被过滤掉，前端随后会错误回退到课程主字幕基线。
    const scope = isSuperAdmin(admin)
        ? `and drafts.status = 'submitted'`
        : options?.submittedOnly
            ? `and drafts.status = 'submitted' and drafts.reviewer_admin_user_id = :adminId`
            : reviewerCanSeeSubmitted
                ? `and (
                     drafts.admin_user_id = :adminId
                     or (drafts.status = 'submitted' and drafts.reviewer_admin_user_id = :adminId)
                   )`
                : `and drafts.admin_user_id = :adminId`;
    const rows = await doRawQuery<SubtitleDraftRow>({
        query: `
            select drafts.id, drafts.exercise_id, drafts.admin_user_id, admins.display_name,
                   drafts.transcript_json, drafts.status, drafts.review_note,
                   drafts.submitted_at, drafts.updated_at
            from exercise_subtitle_drafts drafts
            inner join admin_users admins on admins.id = drafts.admin_user_id
            where drafts.exercise_id = :exerciseId ${scope}
            order by drafts.submitted_at desc, drafts.updated_at desc
        `,
        params: { exerciseId, adminId: admin.id },
    });
    return rows.map(toSubtitleDraft);
}

/**
 * 学习端负责人可读取自己课程的协作字幕，普通学习者永远不可见。
 * 校对人看自己的 editing/submitted/returned 工作稿；二审人只能看提交时
 * 指定给自己的 submitted 稿件，避免把尚未送审的个人修改提前暴露给二审人。
 */
export async function getPreviewSubtitleDraftForLearner(exerciseId: number, learnerUserId: number | undefined) {
    if (!learnerUserId) return undefined;
    const rows = await doRawQuery<SubtitleDraftRow>({
        query: `
            select drafts.id, drafts.exercise_id, drafts.admin_user_id, contributors.display_name,
                   drafts.transcript_json, drafts.status, drafts.review_note,
                   drafts.submitted_at, drafts.updated_at
            from exercise_subtitle_drafts drafts
            inner join admin_users contributors on contributors.id = drafts.admin_user_id
            inner join admin_users preview_admins
              on preview_admins.learner_user_id = :learnerUserId
            inner join exercise_workflow_assignees assignees
              on assignees.exercise_id = drafts.exercise_id
             and assignees.admin_user_id = preview_admins.id
             and assignees.workflow_role in ('proofreader', 'second_reviewer')
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
            where drafts.exercise_id = :exerciseId
              and (
                (
                  assignees.workflow_role = 'proofreader'
                  and drafts.admin_user_id = preview_admins.id
                  and drafts.status in ('editing', 'submitted', 'returned')
                )
                or (
                  assignees.workflow_role = 'second_reviewer'
                  and drafts.reviewer_admin_user_id = preview_admins.id
                  and drafts.status = 'submitted'
                )
              )
            order by drafts.updated_at desc
            limit 1
        `,
        params: { exerciseId, learnerUserId },
    });
    return rows[0] ? toSubtitleDraft(rows[0]) : undefined;
}

/** 兼容后台/旧调用：仅保留已提交稿查询，不用于学习端授权。 */
export async function getLatestSubmittedSubtitleDraft(exerciseId: number) {
    const rows = await doRawQuery<SubtitleDraftRow>({
        query: `select drafts.id, drafts.exercise_id, drafts.admin_user_id, admins.display_name,
                       drafts.transcript_json, drafts.status, drafts.review_note,
                       drafts.submitted_at, drafts.updated_at
                from exercise_subtitle_drafts drafts
                inner join admin_users admins on admins.id = drafts.admin_user_id
                where drafts.exercise_id = :exerciseId and drafts.status = 'submitted'
                order by drafts.submitted_at desc, drafts.updated_at desc limit 1`,
        params: { exerciseId },
    });
    return rows[0] ? toSubtitleDraft(rows[0]) : undefined;
}

/** 保存仅更新个人工作稿；不能改变课程主字幕或发布状态。 */
export async function saveSubtitleDraft({
    exerciseId,
    adminId,
    lines,
}: {
    exerciseId: number;
    adminId: number;
    lines: CreateTranscriptLineRequest[];
}) {
    await sequelize.transaction(async (transaction) => {
    const [course] = await sequelize.query<{ audio_url: string }>('select audio_url from exercises where id=:exerciseId for update', { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction });
    if (!course) throw new Error('课程不存在');
    const [existing] = await sequelize.query<{ status: SubtitleDraftStatus }>('select status from exercise_subtitle_drafts where exercise_id=:exerciseId and admin_user_id=:adminId for update', { replacements: { exerciseId, adminId }, type: QueryTypes.SELECT, transaction });
    if (existing?.status === 'submitted' || existing?.status === 'approved') throw new Error('该字幕稿已提交或审核通过，不能直接修改');
    await sequelize.query(
        `insert into exercise_subtitle_drafts
           (exercise_id, admin_user_id, transcript_json, status, review_note, submitted_at, reviewed_at, reviewed_by_admin_user_id)
         values (:exerciseId, :adminId, cast(:transcriptJson as json), 'editing', null, null, null, null)
         on duplicate key update
           transcript_json = values(transcript_json),
           status = 'editing',
           submitted_at = null,
           reviewed_at = null,
           reviewed_by_admin_user_id = null,
           updated_at = current_timestamp`,
        {
            replacements: {
                exerciseId,
                adminId,
                transcriptJson: JSON.stringify(lines),
            },
            transaction,
        },
    );
    });
    // 滑动窗口：保存即续期，只有停止保存 48 小时以上的任务才会被释放。
    await renewClaimWindow(exerciseId, adminId);
}
