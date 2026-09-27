-- Existing learner accounts have no trustworthy proof of email ownership.
-- Leave them NULL so their next login requires a one-time email confirmation.
alter table users
    add column email_verified_at datetime(3) null;
