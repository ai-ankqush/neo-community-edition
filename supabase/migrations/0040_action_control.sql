-- 0040_action_control.sql — AI Action Control Fabric (Phase 0: Shadow, demo-gated).
--
-- The mediation/enforcement layer, started in SHADOW mode: Neo decides what it
-- *would* do for AI-triggered actions and logs it, but enforces nothing. The
-- customer climbs a per-integration ladder (Shadow → Approval → Autonomous);
-- climbing up is gated by a graduation check, climbing down is instant.
-- See docs/ENFORCEMENT-FABRIC-MEDIATION-DESIGN.md. Service-role only (RLS deny-all).

-- 1) org-level rules per action class (the ~8 the customer manages)
create table if not exists action_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  action_class text not null,   -- notify|draft|create|update|execute|externalize|delete|privilege
  effect      text not null,    -- allow|deny|constrain|step_up
  updated_by  text,
  updated_at  timestamptz not null default now()
);
create unique index if not exists action_rules_key on action_rules(org_id, action_class);
alter table action_rules enable row level security;

-- 2) per use-case × integration: on/off + mode
create table if not exists action_integrations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  use_case_id uuid references use_cases(id) on delete cascade,
  provider    text not null,    -- jira|slack|servicenow|github|aws|...
  enabled     boolean not null default true,
  mode        text not null default 'shadow', -- shadow|approve|autonomous
  updated_by  text,
  updated_at  timestamptz not null default now()
);
create unique index if not exists action_integrations_key on action_integrations(org_id, use_case_id, provider);
alter table action_integrations enable row level security;

-- 3) the shadow decision log ("what we would have done")
create table if not exists action_decisions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  use_case_id     uuid references use_cases(id) on delete cascade,
  provider        text not null,
  action_class    text not null,
  action_label    text not null,   -- "Create ticket INC-204"
  verdict         text not null,   -- allow|deny|constrain|step_up
  boundary_source text not null,   -- declared|evidenced|verified|enforced
  mode_at_time    text not null,   -- shadow|approve|autonomous
  reviewed        boolean not null default false,
  overridden      boolean not null default false,
  override_verdict text,
  simulated       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists action_decisions_scope on action_decisions(org_id, use_case_id, provider, created_at desc);
alter table action_decisions enable row level security;

-- 4) bypass reconciliation findings (Preview scaffold — seeded for demo)
create table if not exists action_bypass_findings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid references use_cases(id) on delete cascade,
  provider     text not null,
  action_label text not null,
  detail       text not null,
  detected_at  timestamptz not null default now()
);
create index if not exists action_bypass_scope on action_bypass_findings(org_id);
alter table action_bypass_findings enable row level security;
