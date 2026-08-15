-- 每日访问事实：一名已登录用户在一个产品端、一个服务器自然日内最多一条。
-- 它只记录活跃归属和当天首次/最后一次访问时间，不保存点击路径、页面内容或设备指纹。
-- 以此精确计算 DAU、WAU、MAU 和跨端活跃分布，而不会把“最后一次登录时间”误当作历史活跃。
create table if not exists user_access_daily (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  client_type enum('web_app', 'mobile_web', 'mobile_app') not null,
  activity_date date not null,
  first_seen_at timestamp not null default current_timestamp,
  last_seen_at timestamp not null default current_timestamp,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_user_access_daily_user_client_date (user_id, client_type, activity_date),
  key idx_user_access_daily_date (activity_date),
  key idx_user_access_daily_client_date (client_type, activity_date)
);
