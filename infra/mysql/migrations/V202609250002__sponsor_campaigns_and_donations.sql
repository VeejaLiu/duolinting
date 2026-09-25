-- Enterprise sponsor terms are prepared now; banner fields are not exposed by public APIs.
alter table sponsors
 add column starts_at datetime(3) null after is_published,
 add column ends_at datetime(3) null after starts_at,
 add column banner_image_url varchar(1024) null after ends_at,
 add column banner_target_url varchar(1024) null after banner_image_url;

-- Amount is an exact decimal string in the API. Receipt bytes are kept in a separate,
-- administrator-only table so ordinary donation lists never load or expose them.
create table if not exists donations (
 id bigint unsigned auto_increment primary key,
 donor_name varchar(120) null,
 is_anonymous tinyint(1) not null default 0,
 amount decimal(12,2) not null,
 currency char(3) not null default 'CNY',
 donated_at datetime(3) not null,
 reference_note varchar(255) not null default '',
 is_published tinyint(1) not null default 0,
 created_at datetime(3) not null,
 updated_at datetime(3) not null,
 key donations_public_order (is_published, donated_at, id)
);

create table if not exists donation_receipts (
 id bigint unsigned auto_increment primary key,
 donation_id bigint unsigned not null,
 content_type varchar(32) not null,
 file_name varchar(255) not null,
 file_data mediumblob not null,
 created_at datetime(3) not null,
 updated_at datetime(3) not null,
 unique key donation_receipts_donation (donation_id)
);
