-- 0039_ai_supply_chain_lifecycle.sql
-- AI Supply Chain Control (Build 3). Lifecycle: material-change detection,
-- re-attestation, and disclosure checklists (RAG / tools-agents).
--
-- The ledger is still DERIVED at read time. To detect what changed we keep one
-- baseline "fingerprint" per scope and diff the live ledger against it. The user
-- acknowledges changes to advance the baseline. Re-attestation reuses the
-- annotations row (when a node was last reviewed). Disclosures capture the parts
-- we can't auto-discover — always labelled "Declared", never "Verified".

-- 1) baseline snapshot per scope (org + use case; null use_case = portfolio)
create table if not exists ai_dependency_snapshots (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid references use_cases(id) on delete cascade,
  fingerprint  jsonb not null,            -- [{key,name,confidence,sev,source,decision,vulnCount,lastModified}]
  transparency int,
  risk_grade   text,
  taken_at     timestamptz not null default now(),
  taken_by     text
);
create index if not exists ai_dep_snapshots_scope on ai_dependency_snapshots (org_id, use_case_id, taken_at desc);
alter table ai_dependency_snapshots enable row level security;

-- 2) re-attestation: when a node was last reviewed and by whom
alter table ai_dependency_annotations
  add column if not exists attested_at timestamptz,
  add column if not exists attested_by text;

-- 3) disclosure checklists — the "Declared" side we can't auto-discover
create table if not exists ai_supply_chain_disclosures (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid references use_cases(id) on delete cascade, -- null = portfolio scope
  area         text not null,             -- rag | tools
  q_key        text not null,
  answer       text not null,             -- yes | no | na
  note         text,
  declared_by  text,
  declared_at  timestamptz not null default now()
);
create index if not exists ai_sc_disclosures_scope
  on ai_supply_chain_disclosures (org_id, use_case_id, area);
alter table ai_supply_chain_disclosures enable row level security;
