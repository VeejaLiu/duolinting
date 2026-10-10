-- linked_at is the UTC cutoff for an anonymous -> account handoff. Only
-- events recorded before that cutoff may finish delivery to the linked user.
set @analytics_link_exists := (select count(*) from information_schema.columns
 where table_schema=database() and table_name='analytics_sessions' and column_name='linked_at');
set @analytics_link_ddl := if(@analytics_link_exists=0,
 'alter table analytics_sessions add column linked_at datetime(3) null', 'select 1');
prepare analytics_link_statement from @analytics_link_ddl;
execute analytics_link_statement;
deallocate prepare analytics_link_statement;

-- NULL means the registration client was never observed; it is not a guess
-- based on the user's latest login or on their current device.
set @analytics_registration_client_exists := (select count(*) from information_schema.columns
 where table_schema=database() and table_name='analytics_user_profiles' and column_name='registration_client_type');
set @analytics_registration_client_ddl := if(@analytics_registration_client_exists=0,
 'alter table analytics_user_profiles add column registration_client_type varchar(24) null', 'select 1');
prepare analytics_registration_client_statement from @analytics_registration_client_ddl;
execute analytics_registration_client_statement;
deallocate prepare analytics_registration_client_statement;

-- Keep legacy date buckets intact. New access facts have explicit UTC endpoint
-- times and a Shanghai stat_date, independent of the MySQL server timezone.
create table if not exists user_access_daily_v2 (
 id bigint unsigned auto_increment primary key,
 user_id bigint unsigned not null, client_type varchar(24) not null,
 stat_date date not null, first_seen_at datetime(3) not null, last_seen_at datetime(3) not null,
 unique key access_user_client_day (user_id,client_type,stat_date),
 key access_stat_date (stat_date)
);
