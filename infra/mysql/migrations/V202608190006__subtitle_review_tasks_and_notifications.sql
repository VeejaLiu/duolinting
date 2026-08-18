-- 提交时快照二审负责人：之后即使管理员重新分配课程，新提交稿仍归原审核人处理，避免待办悄然换人。
alter table exercise_subtitle_drafts
  add column reviewer_admin_user_id bigint unsigned null after admin_user_id,
  add key idx_subtitle_drafts_reviewer_status (reviewer_admin_user_id, status);

-- 迁移前已提交的稿件按当时仍有效的课程审核人补齐；未配置审核人的旧稿保持不可处理，
-- 直到管理员明确指定负责人，避免系统擅自把审核责任交给某个人。
update exercise_subtitle_drafts drafts
inner join exercise_workflow_assignees assignees
  on assignees.exercise_id = drafts.exercise_id
 and assignees.workflow_role = 'second_reviewer'
set drafts.reviewer_admin_user_id = assignees.admin_user_id
where drafts.status = 'submitted' and drafts.reviewer_admin_user_id is null;

-- 后台站内通知。只记录工作流事件，不存登录凭据、字幕正文等敏感或冗余数据。
create table if not exists admin_workflow_notifications (
  id bigint unsigned primary key auto_increment,
  recipient_admin_user_id bigint unsigned not null,
  actor_admin_user_id bigint unsigned not null,
  exercise_id bigint unsigned not null,
  subtitle_draft_id bigint unsigned not null,
  notification_type enum('subtitle_submitted', 'subtitle_returned', 'subtitle_approved') not null,
  review_note text null,
  is_read boolean not null default false,
  created_at timestamp not null default current_timestamp,
  key idx_admin_workflow_notifications_recipient (recipient_admin_user_id, is_read, created_at),
  key idx_admin_workflow_notifications_draft (subtitle_draft_id)
);
