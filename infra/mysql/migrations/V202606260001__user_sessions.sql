create table if not exists user_sessions (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  client_type enum('web_app', 'mobile_web', 'mobile_app') not null,
  token_hash char(64) not null,
  expires_at timestamp not null,
  last_seen_at timestamp null,
  revoked_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_user_sessions_user_client (user_id, client_type),
  key idx_user_sessions_user_id (user_id),
  key idx_user_sessions_expires_at (expires_at)
);
