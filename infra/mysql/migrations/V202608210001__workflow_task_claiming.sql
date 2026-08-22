-- 字幕校对任务的自助领取机制。
-- assignment_source 区分管理员指派与贡献者自助领取：只有自助领取会在超时后自动释放，
-- 管理员指派的任务保留给指派人，仅在超管概览中标记“超期未提交”，不自动回收。
alter table exercise_workflow_assignees
  add column assignment_source varchar(20) not null default 'admin_assigned' after workflow_role,
  add column claimed_at timestamp null after assignment_source,
  add column claim_expires_at timestamp null after claimed_at,
  add column expiring_notified_at timestamp null after claim_expires_at,
  add key idx_workflow_assignees_expiry (claim_expires_at);

-- 该标记仅决定“任务广场是否开放领取”，不影响已分配课程的编辑权。
-- 默认开放：只要课程是草稿且媒体就绪，贡献者即可自助领取。
alter table exercises
  add column claim_blocked boolean not null default false after status,
  add key idx_exercises_claim_pool (claim_blocked, status);

-- 协作审计事件扩展自助领取相关动作。
alter table admin_workflow_activity_events
  modify column event_type enum(
    'workflow_assigned', 'workflow_unassigned',
    'workflow_claimed', 'workflow_claim_released', 'workflow_claim_expired',
    'subtitle_submitted', 'subtitle_returned', 'subtitle_approved'
  ) not null;

-- 领取/释放相关的站内通知不一定有字幕稿，且由系统（无操作者）触发：
-- subtitle_draft_id 与 actor_admin_user_id 改为可空。
alter table admin_workflow_notifications
  modify column subtitle_draft_id bigint unsigned null,
  modify column actor_admin_user_id bigint unsigned null,
  modify column notification_type enum(
    'subtitle_submitted', 'subtitle_returned', 'subtitle_approved',
    'task_claim_expiring', 'task_claim_expired'
  ) not null;

-- 迁移前已存在的工作流负责人一律视为管理员指派，并补齐期限口径。
-- 期限按“最近一次草稿保存 + 48 小时”的滑动窗口计算；没有草稿的旧任务则按
-- 最近一次负责人变更时间 + 48 小时兜底，使超管概览中的“超期未提交”立即可用。
update exercise_workflow_assignees assignees
set assignees.assignment_source = 'admin_assigned',
    assignees.claimed_at = assignees.updated_at,
    -- 滑动窗口口径：最近一次草稿保存 + 48 小时；没有草稿则按负责人变更时间兜底。
    assignees.claim_expires_at = date_add(
      coalesce(
        (
          select max(drafts.updated_at)
          from exercise_subtitle_drafts drafts
          where drafts.exercise_id = assignees.exercise_id
            and drafts.admin_user_id = assignees.admin_user_id
        ),
        assignees.updated_at
      ),
      interval 48 hour
    )
where assignees.workflow_role = 'proofreader'
  and assignees.claimed_at is null;
