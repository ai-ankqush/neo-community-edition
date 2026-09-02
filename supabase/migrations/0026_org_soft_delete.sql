-- Soft delete with a 30-day recovery hold. An admin delete sets deleted_at +
-- purge_after; the org is locked out of the app but recoverable until the
-- dormancy cron hard-purges it after purge_after passes.
alter table organizations add column if not exists deleted_at  timestamptz;
alter table organizations add column if not exists deleted_by  text;
alter table organizations add column if not exists purge_after timestamptz;

create index if not exists idx_org_purge_after
  on organizations (purge_after) where purge_after is not null;
