-- 0007: cross-cutting super-admin access log. Separate from audit_events
-- (which is tenant-scoped with an org FK) because admin actions span all
-- orgs. Append-only record of who viewed the platform admin views and when.

create table admin_access_log (
  id      bigint generated always as identity primary key,
  actor   text not null,            -- clerk user id of the super-admin
  action  text not null,            -- e.g. admin.roster.view
  detail  jsonb,
  at      timestamptz not null default now()
);

alter table admin_access_log enable row level security;
