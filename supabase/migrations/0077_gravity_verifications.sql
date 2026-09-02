-- 0077_gravity_verifications.sql
-- Neo Gravity — the invariant verification suite (build step 9).
--
-- Automated checks that PROVE the invariants hold, rather than asserting them: constitution integrity
-- (hash matches body), safety floor intact, reversibility enforced (nothing irreversible/unknown auto-allowed),
-- bounded authority (no authorization without an ALLOW decision), tamper-evident chain intact, and tenant
-- isolation (scoped accessors never return cross-tenant rows). Each run is recorded so "continuously
-- verified" is a claim we can show.

create table if not exists gravity_verifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  overall    text not null,                 -- pass | warn | fail
  results    jsonb not null default '[]'::jsonb,   -- [{ invariant, status, detail }]
  checked_at timestamptz not null default now()
);
create index if not exists gravity_verifications_org_idx on gravity_verifications (org_id, checked_at desc);
alter table gravity_verifications enable row level security;
comment on table gravity_verifications is
  'Recorded runs of the Gravity invariant verification suite. Each run proves (or fails) each invariant against live state.';
