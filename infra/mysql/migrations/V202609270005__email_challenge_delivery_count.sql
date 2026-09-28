-- Count accepted deliveries across all challenge purposes and server restarts.
alter table user_email_challenges
 add column sent_at datetime(3) null,
 add key email_sent_at (email, sent_at);

-- Be conservative during the first hour after rollout: recent legacy rows may
-- have been sent under the prior limiter, so count them toward the quota.
update user_email_challenges
 set sent_at = created_at
 where created_at > UTC_TIMESTAMP(3) - interval 1 hour;
