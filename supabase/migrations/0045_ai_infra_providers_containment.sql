-- 0045_ai_infra_providers_containment.sql
-- AI infrastructure layer (persisted). The authority graph DERIVES which compute provider
-- each use case runs on; these two tables hold the org-level governance state that can't be
-- derived:
--   * ai_org_providers      — a provider's contract / trust / evidence recorded ONCE at the
--                             org level and reused across every use case that runs on it, so
--                             concentration risk and evidence-once work.
--   * ai_containment_checks — per-use-case "can we contain this if it goes wrong" readiness.
-- Service-role only (app uses supabaseAdmin); RLS on with no policies = deny all.

create table if not exists ai_org_providers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,                                 -- canonical provider name ("Microsoft Azure", "CoreWeave")
  provider_type text,                                 -- managed_model_api | hyperscaler | neocloud_gpu | self_hosted | saas
  is_external boolean not null default true,
  trust_level text not null default 'declared',       -- unknown | declared | documented | configured | verified
  evidence_status text not null default 'missing',    -- missing | partial | current | verified
  contract_status text not null default 'unknown',    -- unknown | none | in_place | with_clauses
  confidence_score int,
  owner text,
  notes text,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_org_providers_name on ai_org_providers (org_id, lower(name));
alter table ai_org_providers enable row level security;

create table if not exists ai_containment_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  use_case_id uuid not null references use_cases(id) on delete cascade,
  control_key text not null,                          -- disable_model | revoke_identity | block_egress | ...
  status text not null default 'not_ready',           -- not_ready | partial | ready
  owner text,
  notes text,
  last_tested_at timestamptz,
  next_test_at timestamptz,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_containment_checks_key on ai_containment_checks (org_id, use_case_id, control_key);
alter table ai_containment_checks enable row level security;
