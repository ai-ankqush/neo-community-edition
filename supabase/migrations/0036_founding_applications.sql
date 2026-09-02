-- 0036_founding_applications.sql
-- Founding Reviewer is now apply -> admin approve (replaces the magic-link
-- auto-grant). Applications are captured here; a super-admin approves, which
-- comps the org to the reviewer plan via the existing grantFoundingComp path.

create table if not exists founding_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text,
  company text,
  role text,
  reason text,
  status text not null default 'pending',  -- pending | approved | declined
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

-- one open application per org
create unique index if not exists founding_applications_pending_org
  on founding_applications (org_id) where status = 'pending';
create index if not exists founding_applications_status_idx
  on founding_applications (status, created_at desc);

-- service-role only (app uses supabaseAdmin); enabling RLS with no policies
-- denies all anon/authenticated access, consistent with the rest of the schema.
alter table founding_applications enable row level security;
