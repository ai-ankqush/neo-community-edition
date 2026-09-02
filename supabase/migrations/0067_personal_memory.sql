-- 0067_personal_memory.sql
-- Personal Memory — "Neo remembers you". PRIVATE to each user: their navigation, what they
-- were mid-way through, their preferences. This is a substrate, not a toggle. Privacy is the
-- architecture: rows are keyed to the user, there is NO org-admin read path, and export to an
-- admin happens only via an explicit, user-initiated consent (recorded below).
-- NOT the security-audit plane (that stays org-visible in audit/Sentinel). See
-- docs/PRESENCE-LOOP-AND-PERSONAL-MEMORY-DESIGN.md.

create table if not exists personal_memory (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,               -- scoping only; NOT an admin read grant
  user_id     text not null,               -- clerk user id — the owner
  kind        text not null,               -- nav | action | intent | preference | rhythm
  key         text not null,               -- section slug / use_case_id / preference name
  value       jsonb not null default '{}'::jsonb,  -- derived signal (counts, timestamps, refs) — never raw records
  weight      numeric not null default 1,  -- accrues with repetition
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (user_id, kind, key)
);
create index if not exists personal_memory_owner_idx on personal_memory (user_id, kind, updated_at desc);

-- Server-only (service role). No RLS policy grants admin/other-user reads — the app layer
-- only ever queries by the requesting user's own id.
alter table personal_memory enable row level security;

create table if not exists personal_memory_consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  scope       text not null,               -- export_to_admin | train_shared | ...
  granted     boolean not null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists personal_memory_consents_user_idx on personal_memory_consents (user_id, scope);
alter table personal_memory_consents enable row level security;
