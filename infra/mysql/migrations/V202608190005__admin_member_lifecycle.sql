-- 后台账号生命周期：停用账号立即阻止登录，并记录最近一次成功登录时间。
alter table admin_users
  add column is_active boolean not null default true after must_change_password,
  add column last_login_at timestamp null after token_expires_at;
