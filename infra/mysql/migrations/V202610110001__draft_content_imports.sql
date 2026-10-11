-- 导入凭据与管理员登录、开放内容读取凭据相互隔离；只保存 SHA-256 摘要。
create table if not exists content_import_tokens (
  id bigint unsigned auto_increment primary key,
  name varchar(120) not null,
  key_prefix varchar(32) not null,
  key_hash char(64) not null,
  category_ids_json json not null,
  created_by_admin_id bigint unsigned not null,
  expires_at timestamp not null,
  revoked_at timestamp null,
  last_used_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_content_import_token_hash (key_hash)
);

-- request_json 是规范化元数据，files_json 只存服务端生成的对象键，不存签名 URL。
-- 全局 source_hash 防止不同工具重复采集；幂等键按 Token 隔离。
create table if not exists content_imports (
  id bigint unsigned auto_increment primary key,
  token_id bigint unsigned not null,
  idempotency_key varchar(128) character set ascii collate ascii_bin not null,
  request_hash char(64) not null,
  source_hash char(64) not null,
  request_json json not null,
  files_json json not null,
  artifacts_json json not null,
  status enum('awaiting_upload', 'queued', 'validating', 'ready', 'failed', 'expired') not null default 'awaiting_upload',
  attempt_id char(36) null,
  lease_until timestamp null,
  expires_at timestamp not null,
  exercise_id bigint unsigned null,
  result_json json null,
  error_json json null,
  cleaned_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_content_import_idempotency (token_id, idempotency_key),
  unique key uq_content_import_source (source_hash),
  key idx_content_import_expiry (expires_at, cleaned_at),
  key idx_content_import_exercise (exercise_id)
);
