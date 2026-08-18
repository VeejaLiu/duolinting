-- 新开通的后台成员以邮箱作为登录标识。保留 username 是为了兼容既有管理员账号，
-- 它们仍可继续登录；新成员只写入 email，不再把账户名展示给管理员。
alter table admin_users
  modify column username varchar(255) not null,
  add column email varchar(255) null after username,
  add unique key uq_admin_users_email (email);
