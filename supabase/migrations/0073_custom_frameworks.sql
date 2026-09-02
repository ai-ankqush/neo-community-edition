-- 0073_custom_frameworks.sql
-- Bring-your-own-framework. Neo ships crosswalks to NIST AI RMF, ISO 42001, EU AI Act, SR 11-7 and
-- NYDFS — but every enterprise also has its OWN control catalogue (internal standard, a regulator's
-- template, a client's requirements). This lets a customer add that framework and map Neo's controls
-- to it, the same way the built-in crosswalks work: by PILLAR (the stable spine), with a per-CONTROL
-- override where the general mapping isn't precise enough. Neo proposes the crosswalk; the human
-- confirms it — the judgement gate, again.

create table if not exists org_frameworks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  key         text not null,               -- slug, unique per org (used as the ref column key)
  name        text not null,               -- display, e.g. "Acme Internal AI Control Standard"
  description text,
  authority   text,                        -- optional owner/regulator, e.g. "Group Risk" / "MAS"
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (org_id, key)
);
create index if not exists org_frameworks_org_idx on org_frameworks (org_id);
alter table org_frameworks enable row level security;

create table if not exists org_framework_mappings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  framework_id uuid not null references org_frameworks(id) on delete cascade,
  scope        text not null,              -- pillar | control
  pillar       int,                        -- set when scope=pillar
  control_id   uuid references control_items(id) on delete cascade,  -- set when scope=control
  reference    text not null,              -- the customer's framework reference(s), e.g. "OC-3; OC-4"
  note         text,
  status       text not null default 'suggested',  -- suggested | confirmed
  source       text not null default 'human',        -- neo | human  (who proposed it)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- one mapping per (framework, pillar) and one override per (framework, control)
create unique index if not exists org_fw_map_pillar_uniq
  on org_framework_mappings (org_id, framework_id, pillar) where scope = 'pillar';
create unique index if not exists org_fw_map_control_uniq
  on org_framework_mappings (org_id, framework_id, control_id) where scope = 'control';
create index if not exists org_fw_map_fw_idx on org_framework_mappings (org_id, framework_id, scope);
alter table org_framework_mappings enable row level security;

comment on table org_framework_mappings is
  'Customer crosswalk: Neo control (by pillar, or a specific control override) → the customer''s own framework reference. status=suggested until a human confirms; source=neo when Neo proposed it.';
