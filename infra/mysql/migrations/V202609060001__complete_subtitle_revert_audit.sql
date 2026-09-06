-- 回退已发布字幕时同时保留原校对人与原二审人的关联，便于团队动态完整展示。
alter table admin_workflow_activity_events
  add column second_reviewer_admin_user_id bigint unsigned null after target_admin_user_id,
  add key idx_admin_workflow_activity_second_reviewer (second_reviewer_admin_user_id, occurred_at);

-- 已发生的回退也从其不可变的已审核稿快照补齐二审人，不让旧动态继续显示残缺。
update admin_workflow_activity_events events
inner join exercise_subtitle_drafts drafts on drafts.id = events.subtitle_draft_id
set events.second_reviewer_admin_user_id = drafts.reviewed_by_admin_user_id
where events.event_type = 'subtitle_reverted'
  and events.second_reviewer_admin_user_id is null;

-- 回退需要像提交、退回和通过一样产生持久化站内通知。
alter table admin_workflow_notifications
  modify column notification_type enum(
    'subtitle_submitted', 'subtitle_returned', 'subtitle_approved', 'subtitle_reverted',
    'task_claim_expiring', 'task_claim_expired'
  ) not null;
