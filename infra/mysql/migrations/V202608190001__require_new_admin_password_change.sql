-- 新建后台账号先由超级管理员发放临时密码；首次登录后必须改为仅本人知晓的密码。
-- 既有账号默认不受影响，避免在功能上线时中断当前管理员的工作。
alter table admin_users
  add column must_change_password boolean not null default false after role;
