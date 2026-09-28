-- A social identity can own a learner account without disclosing an email address.
alter table users modify column email varchar(255) null;

-- Provider subjects are opaque and case sensitive. Email is only a snapshot,
-- never a substitute for (provider, issuer, provider_subject).
create table if not exists user_auth_identities (
 id bigint unsigned auto_increment primary key,
 user_id bigint unsigned not null,
 provider varchar(16) not null,
 issuer varchar(255) not null,
 provider_subject varchar(255) collate utf8mb4_bin not null,
 client_id varchar(255) null,
 provider_email varchar(255) null,
 provider_email_verified tinyint(1) not null default 0,
 refresh_token_ciphertext text null,
 created_at datetime(3) not null,
 updated_at datetime(3) not null,
 unique key provider_subject_unique (provider, issuer, provider_subject),
 unique key user_provider_unique (user_id, provider),
 key identity_user (user_id)
);

-- Auth method records how the session proved identity. Legacy password
-- sessions still require email_verified_at before accessing learner APIs.
alter table user_sessions
 add column auth_method varchar(24) not null default 'email_password';

-- Single-use tickets authorize one sensitive operation on one active session.
create table if not exists user_reauth_tickets (
 id bigint unsigned auto_increment primary key,
 user_id bigint unsigned not null,
 session_id bigint unsigned not null,
 purpose varchar(32) not null,
 ticket_hash char(64) not null,
 expires_at datetime(3) not null,
 consumed_at datetime(3) null,
 created_at datetime(3) not null,
 updated_at datetime(3) not null,
 unique key reauth_ticket_hash (ticket_hash),
 key reauth_user (user_id, session_id, purpose)
);

-- One transaction ties a provider nonce to a client, purpose and optional
-- existing session. Pending collisions retain only verified provider claims.
create table if not exists auth_transactions (
 id bigint unsigned auto_increment primary key,
 provider varchar(16) not null,
 purpose varchar(16) not null,
 reauth_purpose varchar(32) null,
 client_type varchar(16) not null,
 platform varchar(16) not null,
 nonce varchar(128) not null,
 state_hash char(64) null,
 verifier_hash char(64) null,
 return_origin varchar(255) null,
 user_id bigint unsigned null,
 session_id bigint unsigned null,
 provider_issuer varchar(255) null,
 provider_subject varchar(255) collate utf8mb4_bin null,
 client_id varchar(255) null,
 provider_email varchar(255) null,
 provider_email_verified tinyint(1) null,
 refresh_token_ciphertext text null,
 exchange_hash char(64) null,
 result_user_id bigint unsigned null,
 result_kind varchar(16) null,
 expires_at datetime(3) not null,
 consumed_at datetime(3) null,
 created_at datetime(3) not null,
 updated_at datetime(3) not null,
 unique key oauth_state_hash (state_hash),
 unique key oauth_exchange_hash (exchange_hash),
 key oauth_expiry (expires_at, consumed_at)
);
