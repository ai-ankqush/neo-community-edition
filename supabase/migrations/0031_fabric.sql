-- 0031: Governed AI Integration Fabric — spine (read-first / Verification Fabric).
-- org_connections: connect a system once per org, reused by every capability check.
-- control_evidence: first-class evidence object — turns an integration response into
-- an assurance artifact (freshness, expiry, tamper hash). See agent-knowledge/16.

create table if not exists org_connections (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  provider      text not null,                 -- github | aws | okta | ...
  label         text,                          -- e.g. "acme/ml-platform"
  status        text not null default 'connected', -- connected | error | revoked
  scopes        text,
  -- credential holds a NON-secret reference where possible (installation id,
  -- Nango connection id, assumed-role arn). If a raw token must be stored it
  -- should be encrypted at rest / held in a secrets manager — never plaintext.
  credential    jsonb,
  connected_by  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists org_connections_uniq on org_connections (org_id, provider, label);
create index if not exists org_connections_org_idx on org_connections (org_id);
alter table org_connections enable row level security;

create table if not exists control_evidence (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  use_case_id         uuid references use_cases(id) on delete cascade,
  control_id          uuid,                     -- control_items.id when tied to a control
  capability_id       text not null,            -- e.g. ai_bom_present_and_valid
  provider            text,
  result              text not null,            -- pass | fail | partial | error
  policy_decision     text,                     -- allow | deny | conditions
  confidence          text,                     -- high | medium | low
  raw_artifact_ref    text,                     -- pointer to the original (e.g. BOM file URL)
  normalized_artifact jsonb,                    -- normalized form Neo reasons on
  remediation_hint    text,
  checked_at          timestamptz not null default now(),
  valid_until         timestamptz,              -- freshness / expiry
  trigger_for_recheck text,                     -- e.g. repo_change | config_drift | 24h
  tamper_hash         text,                     -- integrity (Graph-integrity ledger)
  created_by          text
);
create index if not exists control_evidence_uc_idx on control_evidence (org_id, use_case_id);
create index if not exists control_evidence_cap_idx on control_evidence (org_id, capability_id);
alter table control_evidence enable row level security;
