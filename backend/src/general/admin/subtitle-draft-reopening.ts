import { QueryTypes } from 'sequelize';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../models/db-config-mysql';

/** 新一轮领取/指派复用个人工作稿前，保存旧稿证据，再以当前课程字幕重新开始。 */
export async function reopenApprovedSubtitleDraft(
    exerciseId: number,
    adminId: number,
    transaction: Transaction,
) {
    const options = { replacements: { exerciseId, adminId }, transaction };
    // 锁课程行以串行化同一课程的版本号分配；已发布或正在二审的课程不能重开。
    const [exercise] = await sequelize.query<{ status: string }>(
        'select status from exercises where id = :exerciseId for update',
        { ...options, type: QueryTypes.SELECT },
    );
    if (exercise?.status !== 'draft') return;
    const [draft] = await sequelize.query<{ id: number }>(
        `select id from exercise_subtitle_drafts
         where exercise_id = :exerciseId and admin_user_id = :adminId and status = 'approved'
         for update`,
        { ...options, type: QueryTypes.SELECT },
    );
    // 未开稿、正在编辑、退回修改、待审稿均保持原样，避免重新领取覆盖尚未完成的劳动。
    if (!draft) return;
    const [version] = await sequelize.query<{ next_no: number }>(
        `select coalesce(max(version_no), 0) + 1 as next_no
         from exercise_subtitle_versions where exercise_id = :exerciseId`,
        { ...options, type: QueryTypes.SELECT },
    );

    // transcript_json 原样复制，保留精确时间轴和扩展字段。note 中保存上一轮审核
    // 元数据（账号 ID、UTC 时间及审核意见），供工作稿复用后追溯；不新增审核事件。
    await sequelize.query(
        `insert into exercise_subtitle_versions
           (exercise_id, subtitle_draft_id, version_no, transcript_json, source, admin_user_id, note)
         select drafts.exercise_id, drafts.id, :versionNo,
                drafts.transcript_json, 'approved', drafts.admin_user_id,
                cast(json_object(
                  'reason', '新一轮校对开始前保留原已通过工作稿',
                  'reviewerAdminUserId', drafts.reviewer_admin_user_id,
                  'reviewedByAdminUserId', drafts.reviewed_by_admin_user_id,
                  'submittedAt', drafts.submitted_at, 'reviewedAt', drafts.reviewed_at,
                  'updatedAt', drafts.updated_at, 'reviewNote', drafts.review_note
                ) as char)
         from exercise_subtitle_drafts drafts
         where drafts.exercise_id = :exerciseId and drafts.admin_user_id = :adminId
           and drafts.status = 'approved'`,
        { ...options, replacements: { ...options.replacements, versionNo: Number(version.next_no) } },
    );
    // 上次个人稿可能与管理员修订后的正式字幕不同，必须从当前课程主字幕起步。
    // 与领取/指派共用事务，确保任务持有人、可编辑状态和历史快照一起成功或回滚。
    await sequelize.query(
        `update exercise_subtitle_drafts drafts
         inner join exercises on exercises.id = drafts.exercise_id
         set drafts.transcript_json = exercises.transcript_json, drafts.status = 'editing',
             drafts.reviewer_admin_user_id = null, drafts.reviewed_by_admin_user_id = null,
             drafts.submitted_at = null, drafts.reviewed_at = null, drafts.review_note = null,
             drafts.updated_at = current_timestamp
         where drafts.exercise_id = :exerciseId and drafts.admin_user_id = :adminId
           and drafts.status = 'approved' and exercises.status = 'draft'`,
        options,
    );
}
