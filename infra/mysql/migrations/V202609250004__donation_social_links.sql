-- Optional social profiles for donor recognition. Anonymous donors retain these only in Admin.
-- Format: JSON array of up to six objects: {"platform":"instagram","url":"https://..."}.
alter table donations
 add column social_links_json json null after donation_item,
 add column show_social_links_publicly tinyint(1) not null default 0 after social_links_json;

-- Email is private by default; public display requires a separate donor-consent flag.
alter table donations
 add column contact_email varchar(255) null after social_links_json,
 add column show_email_publicly tinyint(1) not null default 0 after contact_email;
