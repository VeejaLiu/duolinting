-- Sponsor profiles are curated by super administrators and shown only after publication.
create table if not exists sponsors (
 id bigint unsigned auto_increment primary key,
 name varchar(160) not null,
 description varchar(600) not null default '',
 logo_url varchar(1024) null,
 website_url varchar(1024) null,
 sort_order int not null default 0,
 is_published tinyint(1) not null default 0,
 created_at datetime(3) not null,
 updated_at datetime(3) not null,
 key sponsors_public_order (is_published, sort_order, id)
);
