-- 0005: platform role assignments (replaces Clerk's paid custom-roles add-on)
-- Clerk org admins are always org_admin; everyone else gets their platform
-- role here. Default for unlisted members: viewer (least privilege).

create table memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     text not null,            -- clerk user id
  role        text not null default 'viewer',  -- assessor | contributor | viewer
  updated_by  text,
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create index on memberships (org_id);
alter table memberships enable row level security;
