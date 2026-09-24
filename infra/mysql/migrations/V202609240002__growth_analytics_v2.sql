-- UTC DATETIME fields are written explicitly; stat_date always means Asia/Shanghai.
-- Coverage is configured by operators after verifying deployment, never inferred from MIN(event_at).
create table if not exists analytics_coverage (
 id bigint unsigned auto_increment primary key,
 metric varchar(32) not null, client_type varchar(24) not null,
 starts_at datetime(3) not null, ends_at datetime(3) null,
 status varchar(24) not null, source_timezone varchar(64) null,
 note varchar(255) not null default '',
 key coverage_window (metric, client_type, starts_at)
);
create table if not exists analytics_user_profiles (
 id bigint unsigned auto_increment primary key, user_id bigint unsigned not null,
 registration_country varchar(8) not null default 'unknown', registration_source varchar(100) not null default 'direct_or_unknown',
 first_observed_country varchar(8) not null default 'unknown', first_observed_at datetime(3) null,
 activated_at datetime(3) null, activation_country varchar(8) not null default 'unknown',
 is_internal boolean not null default false, consent varchar(16) not null default 'unknown', consent_changed_at datetime(3) null,
 unique key profile_user (user_id)
);
create table if not exists analytics_sessions (
 id bigint unsigned auto_increment primary key, analytics_session_id char(36) not null,
 identity_epoch char(64) not null, user_id bigint unsigned null, anonymous_id char(36) not null,
 client_type varchar(24) not null, surface varchar(24) not null, environment varchar(16) not null,
 started_at datetime(3) not null, last_activity_at datetime(3) not null, expires_at datetime(3) not null,
 revoked_at datetime(3) null, country_code varchar(8) not null default 'unknown',
 attribution json not null,
 unique key session_uuid (analytics_session_id), unique key session_epoch (identity_epoch),
 key session_user (user_id), key session_expiry (expires_at)
);
create table if not exists analytics_events (
 id bigint unsigned auto_increment primary key, event_id char(36) not null, schema_version smallint not null default 1,
 event_name varchar(48) not null, user_id bigint unsigned null, anonymous_id char(36) null,
 identity_epoch char(64) not null, analytics_session_id char(36) not null, study_session_id char(36) null,
 operation_id char(36) null, seq int unsigned not null,
 event_at datetime(3) not null, received_at datetime(3) not null, stat_date date not null,
 client_type varchar(24) not null, surface varchar(24) not null, environment varchar(16) not null,
 country_code varchar(8) not null default 'unknown', geo_source varchar(24) not null,
 geo_observed_at datetime(3) null, geo_db_version varchar(64) null,
 app_build varchar(64) not null, exercise_id bigint unsigned null, course_version varchar(128) null,
 definition_version varchar(32) not null default 'growth_v2_1', properties json not null,
 unique key event_uuid (event_id), unique key event_sequence (analytics_session_id, seq),
 unique key event_operation (identity_epoch, operation_id),
 key event_user_time (user_id, event_at), key event_name_time (event_name, event_at),
 key event_session_time (analytics_session_id, event_at)
);
-- Intervals are retained with daily facts so offline arrivals can rebuild a union, not add totals twice.
create table if not exists analytics_user_daily (
 id bigint unsigned auto_increment primary key, user_id bigint unsigned not null, stat_date date not null,
 play_ms bigint unsigned not null default 0, practice_count int unsigned not null default 0,
 qualified boolean not null default false, intervals json not null, practiced_lines json not null,
 definition_version varchar(32) not null default 'growth_v2_1', unique key user_day (user_id, stat_date)
);
create table if not exists analytics_user_dimension_daily (
 id bigint unsigned auto_increment primary key, user_id bigint unsigned not null, stat_date date not null,
 client_type varchar(24) not null, country_code varchar(8) not null, surface varchar(24) not null,
 play_ms bigint unsigned not null default 0, intervals json not null, first_at datetime(3) not null, last_at datetime(3) not null,
 unique key dimension_day (user_id, stat_date, client_type, country_code, surface)
);
create table if not exists analytics_traffic_daily (
 id bigint unsigned auto_increment primary key, stat_date date not null, provider varchar(32) not null,
 host varchar(255) not null, delivery_role varchar(24) not null, dimension_type varchar(32) not null,
 dimension_value varchar(64) not null, resource_type varchar(24) not null, source_id varchar(128) not null,
 bytes bigint unsigned not null, requests bigint unsigned not null, errors bigint unsigned not null, hits bigint unsigned not null,
 sampling decimal(8,6) not null default 1, completeness varchar(24) not null, observed_at datetime(3) not null,
 unique key traffic_source (stat_date, provider, host, delivery_role, dimension_type, dimension_value, resource_type, source_id)
);
