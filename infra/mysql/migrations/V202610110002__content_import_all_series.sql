-- 明确记录“全部系列”，不把空白名单视为全权；旧凭据默认保持原有的系列限制。
-- 此权限动态覆盖以后新增系列，但仍只允许导入草稿，不能创建目录或发布课程。
alter table content_import_tokens
  add column all_categories boolean not null default false after category_ids_json;
