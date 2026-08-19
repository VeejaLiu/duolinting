-- 面向所有后台成员的协作审计时间线。此表只追加事件，不保存字幕正文、邮箱或登录凭据。
-- actor 是实际执行操作的人；target 是被分配、接收审核或接收退回结果的人。
create table if not exists admin_workflow_activity_events (
  id bigint unsigned primary key auto_increment,
  event_type enum('workflow_assigned', 'workflow_unassigned', 'subtitle_submitted', 'subtitle_returned', 'subtitle_approved') not null,
  actor_admin_user_id bigint unsigned null,
  target_admin_user_id bigint unsigned null,
  exercise_id bigint unsigned not null,
  subtitle_draft_id bigint unsigned null,
  workflow_role enum('proofreader', 'second_reviewer') null,
  review_note text null,
  occurred_at timestamp not null default current_timestamp,
  key idx_admin_workflow_activity_occurred (occurred_at, id),
  key idx_admin_workflow_activity_actor (actor_admin_user_id, occurred_at),
  key idx_admin_workflow_activity_target (target_admin_user_id, occurred_at),
  key idx_admin_workflow_activity_exercise (exercise_id, occurred_at)
);

-- 旧系统尚未记录事件表时，仍可根据现有草稿记录恢复最后一次提交、退回或通过的责任人和时间。
-- 更早且已被同一草稿后续状态覆盖的历史无法可靠复原，因此不伪造这些事件。
insert into admin_workflow_activity_events
  (event_type, actor_admin_user_id, target_admin_user_id, exercise_id, subtitle_draft_id, workflow_role, review_note, occurred_at)
select 'subtitle_submitted', drafts.admin_user_id, drafts.reviewer_admin_user_id,
       drafts.exercise_id, drafts.id, 'proofreader', null, drafts.submitted_at
from exercise_subtitle_drafts drafts
where drafts.submitted_at is not null
  and not exists (
    select 1 from admin_workflow_activity_events events
    where events.event_type = 'subtitle_submitted'
      and events.subtitle_draft_id = drafts.id
      and events.occurred_at = drafts.submitted_at
  );

insert into admin_workflow_activity_events
  (event_type, actor_admin_user_id, target_admin_user_id, exercise_id, subtitle_draft_id, workflow_role, review_note, occurred_at)
select 'subtitle_returned', drafts.reviewed_by_admin_user_id, drafts.admin_user_id,
       drafts.exercise_id, drafts.id, 'second_reviewer', drafts.review_note, drafts.reviewed_at
from exercise_subtitle_drafts drafts
where drafts.status = 'returned'
  and drafts.reviewed_at is not null
  and not exists (
    select 1 from admin_workflow_activity_events events
    where events.event_type = 'subtitle_returned'
      and events.subtitle_draft_id = drafts.id
      and events.occurred_at = drafts.reviewed_at
  );

insert into admin_workflow_activity_events
  (event_type, actor_admin_user_id, target_admin_user_id, exercise_id, subtitle_draft_id, workflow_role, review_note, occurred_at)
select 'subtitle_approved', drafts.reviewed_by_admin_user_id, drafts.admin_user_id,
       drafts.exercise_id, drafts.id, 'second_reviewer', null, drafts.reviewed_at
from exercise_subtitle_drafts drafts
where drafts.status = 'approved'
  and drafts.reviewed_at is not null
  and not exists (
    select 1 from admin_workflow_activity_events events
    where events.event_type = 'subtitle_approved'
      and events.subtitle_draft_id = drafts.id
      and events.occurred_at = drafts.reviewed_at
  );
