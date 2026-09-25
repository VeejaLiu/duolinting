-- Optional bookkeeping label for what a donation supports, separate from amount and payment notes.
alter table donations add column donation_item varchar(160) not null default '' after currency;
