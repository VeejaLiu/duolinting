-- 开放内容 API Key 只保存不可逆摘要；原始 Key 仅在创建接口的当次响应中出现。
-- 不设数据库外键，沿用项目由应用层维护管理员与内容关系的约定。
create table if not exists admin_open_content_api_keys (
  id bigint unsigned auto_increment primary key,
  name varchar(120) not null,
  key_prefix varchar(32) not null,
  key_hash char(64) not null,
  created_by_admin_id bigint unsigned not null,
  expires_at timestamp null,
  last_used_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_admin_open_content_api_keys_key_hash (key_hash),
  key idx_admin_open_content_api_keys_expires_at (expires_at)
);
