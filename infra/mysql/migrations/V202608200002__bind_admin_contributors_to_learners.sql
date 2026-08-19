-- 后台字幕贡献者绑定学习端账号；学习端预览权限由课程工作流负责人自动派生。
set @admin_learner_user_id_exists := (
  select count(*) from information_schema.columns
  where table_schema = database() and table_name = 'admin_users' and column_name = 'learner_user_id'
);
set @admin_learner_user_id_ddl := if(
  @admin_learner_user_id_exists = 0,
  'alter table admin_users add column learner_user_id bigint unsigned null after email',
  'select 1'
);
prepare admin_learner_user_id_statement from @admin_learner_user_id_ddl;
execute admin_learner_user_id_statement;
deallocate prepare admin_learner_user_id_statement;

set @admin_learner_user_id_index_exists := (
  select count(*) from information_schema.statistics
  where table_schema = database() and table_name = 'admin_users' and index_name = 'uq_admin_users_learner_user_id'
);
set @admin_learner_user_id_index_ddl := if(
  @admin_learner_user_id_index_exists = 0,
  'alter table admin_users add unique key uq_admin_users_learner_user_id (learner_user_id)',
  'select 1'
);
prepare admin_learner_user_id_index_statement from @admin_learner_user_id_index_ddl;
execute admin_learner_user_id_index_statement;
deallocate prepare admin_learner_user_id_index_statement;

-- 现有账号优先按相同邮箱自动绑定；一个学习端账号只能绑定一个后台贡献者。
update admin_users admins
inner join users learners on lower(learners.email) = lower(coalesce(admins.email, admins.username))
set admins.learner_user_id = learners.id
where admins.role = 'subtitle_contributor'
  and admins.learner_user_id is null;
