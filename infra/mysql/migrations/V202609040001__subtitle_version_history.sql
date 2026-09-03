-- 字幕版本历史：保留「提交 / 审核通过 / 回退」三个关键节点的字幕快照，供后续校对者回溯与审计。
-- 现有 exercise_subtitle_drafts 每门课每位贡献者只有一份草稿（唯一键覆盖更新），无法保留历史版本；
-- 本表只追加、不覆盖，作为"证据链"，回退也必须在这里留下带理由的记录。
create table if not exists exercise_subtitle_versions (
  id bigint unsigned primary key auto_increment,
  exercise_id bigint unsigned not null,
  subtitle_draft_id bigint unsigned null,
  version_no int unsigned not null,
  transcript_json json not null,
  source enum('submitted', 'approved', 'reverted') not null,
  admin_user_id bigint unsigned not null,
  note text null,
  created_at timestamp not null default current_timestamp,
  key idx_subtitle_versions_exercise (exercise_id, version_no),
  key idx_subtitle_versions_draft (subtitle_draft_id)
);

-- 协作审计事件补充"回退"动作，与版本历史表一起作为回退证据。
alter table admin_workflow_activity_events
  modify column event_type enum(
    'workflow_assigned', 'workflow_unassigned',
    'workflow_claimed', 'workflow_claim_released', 'workflow_claim_expired',
    'subtitle_submitted', 'subtitle_returned', 'subtitle_approved',
    'subtitle_reverted'
  ) not null;
