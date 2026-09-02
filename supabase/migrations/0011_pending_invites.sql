-- 0011: pending platform-role for invitations. Clerk handles the invite + its
-- own admin/member role; we stash the intended platform role here, keyed by
-- email, and apply it to memberships when the invited user joins.

create table pending_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        text not null,            -- assessor | contributor | viewer
  invited_by  text,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);

create index on pending_invites (org_id);
alter table pending_invites enable row level security;
