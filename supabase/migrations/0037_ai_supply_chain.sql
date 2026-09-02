-- 0037_ai_supply_chain.sql
-- AI Supply Chain Control (Build 1). The dependency ledger is DERIVED at read
-- time from each use case's AI-BOM + classification, so the nodes themselves
-- aren't persisted yet. This table stores the human-in-the-loop ANNOTATIONS on
-- those derived nodes (risk acceptance, confirmation, change-watch), keyed by a
-- stable node_key (slug of name+type). Build 2 will persist the full ledger.

create table if not exists ai_dependency_annotations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  use_case_id uuid references use_cases(id) on delete cascade,
  node_key text not null,
  confidence_override text,          -- unknown | declared | evidenced | verified
  risk_accepted boolean not null default false,
  accepted_rationale text,
  change_watch boolean not null default false,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_dep_annotations_key
  on ai_dependency_annotations (org_id, use_case_id, node_key);

-- service-role only (app uses supabaseAdmin); RLS on with no policies = deny all.
alter table ai_dependency_annotations enable row level security;
