-- 0019: inactive-account dormancy. Track last activity; a cron warns owners of
-- orgs inactive 90+ days and hard-deletes if not confirmed within the grace
-- window. Paying and demo orgs are always exempt (enforced in the cron).

alter table organizations add column if not exists last_active_at     timestamptz not null default now();
alter table organizations add column if not exists dormancy_warned_at timestamptz;
alter table organizations add column if not exists confirm_token       text;

create index if not exists organizations_last_active_idx on organizations (last_active_at);
