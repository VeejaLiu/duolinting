-- Native App ID and web Services ID can each issue a distinct Apple refresh
-- token for the same provider subject. Keep both so account deletion revokes
-- every authorization instead of only the last platform used.
create table if not exists user_auth_grants (
 id bigint unsigned auto_increment primary key,
 user_id bigint unsigned not null,
 identity_id bigint unsigned not null,
 provider varchar(16) not null,
 client_id varchar(255) not null,
 refresh_token_ciphertext text not null,
 created_at datetime(3) not null,
 updated_at datetime(3) not null,
 unique key identity_client_grant (identity_id, client_id),
 key grant_user (user_id)
);
