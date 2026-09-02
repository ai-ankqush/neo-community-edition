-- 0046_integration_composer.sql
-- Neo Integration Composer — customer-managed, READ-ONLY live control verification connectors
-- for the long tail of systems Neo doesn't ship a provider connector for. Per-org, RLS deny-all
-- (service-role only). Credentials are stored here and MUST be encrypted at rest before this
-- leaves demo (same prerequisite as org_connections). The runner enforces read-only + SSRF guard.

create table if not exists ai_custom_connectors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,                               -- friendly name, e.g. "Acme Splunk"
  system_name text not null,                        -- the product, e.g. "Splunk"
  base_url text not null,                            -- https origin the runner pins requests to
  host text not null,                               -- hostname extracted from base_url (allowlist)
  auth_type text not null default 'api_token',      -- api_token | custom_header
  credential jsonb,                                 -- { token } or { header_name, header_value } — encrypt at rest
  status text not null default 'active',            -- active | disabled
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_custom_connectors_org on ai_custom_connectors (org_id);
alter table ai_custom_connectors enable row level security;

create table if not exists ai_custom_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  connector_id uuid not null references ai_custom_connectors(id) on delete cascade,
  use_case_id uuid references use_cases(id) on delete cascade,
  control_item_id uuid,                             -- the control this verifies (rolls status up)
  control_text text,
  method text not null default 'GET',               -- runner enforces read-only
  path text not null,                               -- appended to base_url
  query jsonb,                                      -- { key: value } querystring
  assertion jsonb not null,                         -- { conditions: [...] } — see lib/composer.ts
  plain_summary text,                               -- Ask Neo's plain-English "what Neo will check"
  last_state text,                                  -- detailed ResultState
  last_rollup text,                                 -- verified | partial | missing | na
  last_findings jsonb,
  last_run_at timestamptz,
  expires_at timestamptz,                           -- freshness — past this it goes stale
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_custom_checks_org on ai_custom_checks (org_id, use_case_id);
create index if not exists ai_custom_checks_control on ai_custom_checks (control_item_id);
alter table ai_custom_checks enable row level security;
