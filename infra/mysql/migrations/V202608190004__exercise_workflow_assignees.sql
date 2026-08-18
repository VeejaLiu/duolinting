-- 工作流负责人是未来/当前职责；exercise_contributions 只保留实际完成后的公开署名。
-- 每门课程每个职责恰好可有一人，校对与二审均由字幕贡献者承担。
create table if not exists exercise_workflow_assignees (
  id bigint unsigned primary key auto_increment,
  exercise_id bigint unsigned not null,
  workflow_role enum('proofreader', 'second_reviewer') not null,
  admin_user_id bigint unsigned not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_exercise_workflow_assignee (exercise_id, workflow_role),
  key idx_workflow_assignees_exercise_id (exercise_id),
  key idx_workflow_assignees_admin_user_id (admin_user_id)
);
