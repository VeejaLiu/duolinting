-- 协作制课的最小权限模型：保留现有管理员账号，新增超级管理员与字幕贡献者两种角色。
-- 旧的 admin 账号在迁移时提升为 super_admin，避免上线后出现无人能管理协作者的情况。
alter table admin_users
  modify column role varchar(40) not null default 'subtitle_contributor';

update admin_users
set role = 'super_admin'
where role = 'admin';

-- 志愿者是学习端账号的预览资格，而不是后台内容编辑权限。
-- 只有开启此字段的学习者可以读取草稿和已校对课程；普通学习者仍只能读取已发布课程。
alter table users
  add column is_preview_volunteer boolean not null default false after display_name,
  add key idx_users_preview_volunteer (is_preview_volunteer);

-- 课程状态中的 proofread 表示字幕贡献者完成校对并提交，等待超级管理员二次审核。
alter table exercises
  modify column status enum('draft', 'proofread', 'published', 'archived') not null default 'draft';

-- 超级管理员将课程逐门分配给字幕贡献者。没有分配记录的贡献者不得读取或编辑该课程。
create table if not exists exercise_contributor_assignments (
  id bigint unsigned primary key auto_increment,
  exercise_id bigint unsigned not null,
  admin_user_id bigint unsigned not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_exercise_contributor_assignment (exercise_id, admin_user_id),
  key idx_contributor_assignments_admin_user_id (admin_user_id),
  key idx_contributor_assignments_exercise_id (exercise_id)
);

-- 课程页公开展示的贡献归属。每个关键环节只保留当前负责人的署名：
-- proofreader 为提交“已校对”的字幕贡献者，second_reviewer 为完成二次审核并发布的超级管理员。
create table if not exists exercise_contributions (
  id bigint unsigned primary key auto_increment,
  exercise_id bigint unsigned not null,
  admin_user_id bigint unsigned not null,
  contribution_role enum('proofreader', 'second_reviewer') not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_exercise_contribution_role (exercise_id, contribution_role),
  key idx_exercise_contributions_admin_user_id (admin_user_id),
  key idx_exercise_contributions_exercise_id (exercise_id)
);
