-- 贡献者的工作稿独立保存，避免“保存”覆盖课程当前的正式字幕或改变发布状态。
-- 每位贡献者在每门获授权课程上有一份可持续编辑的草稿；submitted 才进入二次审核队列。
create table if not exists exercise_subtitle_drafts (
  id bigint unsigned primary key auto_increment,
  exercise_id bigint unsigned not null,
  admin_user_id bigint unsigned not null,
  transcript_json json not null,
  status enum('editing', 'submitted', 'returned', 'approved') not null default 'editing',
  review_note text null,
  submitted_at timestamp null,
  reviewed_at timestamp null,
  reviewed_by_admin_user_id bigint unsigned null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_exercise_subtitle_draft_contributor (exercise_id, admin_user_id),
  key idx_subtitle_drafts_exercise_status (exercise_id, status),
  key idx_subtitle_drafts_contributor (admin_user_id)
);
