-- 每日学习活动记录：按 (user_id, day) 聚合掌握句数，是连胜（streak）和
-- 每日目标进度的服务端事实来源。两端客户端在点「掌握」时上报增量，
-- streak 与今日进度由 days 记录计算得出，不再只存 mobile 本地。
create table if not exists user_daily_activity (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  -- 客户端本地日期（yyyy-MM-dd）：streak 按用户本地自然日计算，
  -- 不能用服务器时区的 current_date 代替。
  day date not null,
  mastered_count int unsigned not null default 0,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_user_daily_activity_user_day (user_id, day),
  key idx_user_daily_activity_user_id (user_id)
);

-- 每日目标值跟语言偏好一样属于用户级设置，直接放在 user_preferences。
alter table user_preferences
  add column daily_goal int unsigned not null default 10 after content_locale;
