-- token 存放 SHA-256 十六进制摘要（64 字符），不再存储可直接使用的 bearer token。
-- token_expires_at 是管理员会话的绝对过期时间；NULL 表示当前没有有效会话。
alter table admin_users
  modify column token varchar(64) null,
  add column token_expires_at timestamp null after token;
