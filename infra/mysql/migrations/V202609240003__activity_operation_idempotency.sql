-- Preserve local-day streak semantics while deduplicating retried client operations.
create table if not exists user_activity_operations (
 id bigint unsigned auto_increment primary key,
 user_id bigint unsigned not null,
 operation_id char(36) not null,
 created_at datetime(3) not null,
 unique key user_operation (user_id, operation_id),
 key operation_retention (created_at)
);
