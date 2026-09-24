-- Short-lived, single-use verification codes for learner registration and password recovery.
-- Codes are stored as keyed hashes; plaintext codes exist only long enough to send the email.
create table if not exists user_email_challenges (
 id bigint unsigned auto_increment primary key,
 email varchar(255) not null,
 purpose varchar(32) not null,
 code_hash char(64) not null,
 failed_attempts int unsigned not null default 0,
 expires_at datetime(3) not null,
 consumed_at datetime(3) null,
 created_at datetime(3) not null,
 updated_at datetime(3) not null,
 key email_purpose_created (email, purpose, created_at),
 key challenge_retention (expires_at, consumed_at)
);
