-- 来源链接和已有的 source 文本备注用途不同：前者是可打开的公开出处 URL。
-- 本地测试库可能曾被手工补过字段，因此按 information_schema 判断后再执行 DDL，
-- 使迁移在已有数据库上仍可安全落地。
set @category_source_url_exists := (
  select count(*)
  from information_schema.columns
  where table_schema = database()
    and table_name = 'categories'
    and column_name = 'source_url'
);
set @add_category_source_url := if(
  @category_source_url_exists = 0,
  'alter table categories add column source_url varchar(2048) null after cover_image_url',
  'select 1'
);
prepare add_category_source_url_statement from @add_category_source_url;
execute add_category_source_url_statement;
deallocate prepare add_category_source_url_statement;

set @exercise_source_url_exists := (
  select count(*)
  from information_schema.columns
  where table_schema = database()
    and table_name = 'exercises'
    and column_name = 'source_url'
);
set @add_exercise_source_url := if(
  @exercise_source_url_exists = 0,
  'alter table exercises add column source_url varchar(2048) null after source',
  'select 1'
);
prepare add_exercise_source_url_statement from @add_exercise_source_url;
execute add_exercise_source_url_statement;
deallocate prepare add_exercise_source_url_statement;
