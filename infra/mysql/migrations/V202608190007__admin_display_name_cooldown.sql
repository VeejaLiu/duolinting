-- 贡献者的课程署名需要保持稳定；此字段记录本人最近一次主动改名时间。
-- NULL 表示该账号尚未使用过自助改名，可立即完成第一次修改。
-- 本地环境可能已由管理员直接执行过这项变更，因此先检查字段，避免后续迁移重复失败。
set @display_name_cooldown_column_exists := (
  select count(*)
  from information_schema.columns
  where table_schema = database()
    and table_name = 'admin_users'
    and column_name = 'last_display_name_changed_at'
);
set @display_name_cooldown_ddl := if(
  @display_name_cooldown_column_exists = 0,
  'alter table admin_users add column last_display_name_changed_at timestamp null after display_name',
  'select 1'
);
prepare display_name_cooldown_statement from @display_name_cooldown_ddl;
execute display_name_cooldown_statement;
deallocate prepare display_name_cooldown_statement;
