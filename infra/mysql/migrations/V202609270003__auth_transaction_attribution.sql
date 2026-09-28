-- Social registration completes after an external authorization callback.
-- Retain only the hashed analytics context and coarse request location for
-- the transaction lifetime so the signup event keeps its acquisition source.
alter table auth_transactions
 add column analytics_epoch_hash char(64) null,
 add column registration_country varchar(16) null,
 add column registration_geo_source varchar(32) null;
