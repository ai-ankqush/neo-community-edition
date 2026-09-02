-- neo-platform: initial schema (Layer 3 data model, spec section 7)
-- Tenancy: org_id on every tenant table. Access only via server routes
-- (service role) with mandatory org scoping. RLS = deny-all defense in depth.

create extension if not exists "pgcrypto";

-- ============================================================ core tenancy
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  clerk_org_id text unique not null,
  name        text not null,
  plan        text not null default 'starter',  -- starter | professional | enterprise
  region      text not null default 'us',
  created_at  timestamptz not null default now()
);

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================ use cases
create table use_cases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  workspace_id  uuid references workspaces(id),
  name          text not null,
  description   text,
  status        text not null default 'active',   -- active | archived
  stage         text not null default 'intake',   -- stage machine state
  tier          int,                              -- 1-5, set at tier stage
  patterns      text[] default '{}',
  stack         jsonb default '{}',               -- declared tech stack
  scope_lock    jsonb default '{}',               -- escalation triggers (tripwires)
  methodology_version text,
  created_by    text not null,                    -- clerk user id
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table stage_records (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  use_case_id     uuid not null references use_cases(id) on delete cascade,
  stage           text not null,
  ai_draft        jsonb,            -- what the engine produced
  accepted_output jsonb,            -- what the human accepted (possibly edited)
  edits_made      boolean default false,
  accepted_by     text,             -- clerk user id
  accepted_at     timestamptz,
  model           text,
  methodology_version text,
  created_at      timestamptz not null default now()
);

create table questions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  stage        text not null default 'questions',
  text         text not null,
  assignee     text,
  answer       text,
  answered_by  text,
  status       text not null default 'open',  -- open | answered | not_applicable
  created_at   timestamptz not null default now()
);

-- ============================================================ controls & evidence
create table control_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  pillar       int not null check (pillar between 1 and 10),
  control      text not null,
  why          text,
  requirement  text not null default 'required',  -- required | recommended | n/a
  status       text not null default 'gap',       -- gap | partial | in_place | n/a
  owner        text,
  created_at   timestamptz not null default now()
);

create table evidence_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  control_ids  uuid[] default '{}',
  title        text not null,
  source       text not null default 'manual',  -- manual | connector
  file_ref     text,                            -- storage path
  collected_at timestamptz,
  expires_at   timestamptz,
  version      int not null default 1,
  status       text not null default 'requested', -- requested | provided | expired
  created_at   timestamptz not null default now()
);

create table assurance_tests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  objective    text not null,
  method       text,
  expected     text,
  result       text not null default 'not_started', -- not_started | passed | failed | in_progress
  owner        text,
  run_at       timestamptz,
  created_at   timestamptz not null default now()
);

-- ============================================================ decision lifecycle
create table conditions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  text         text not null,
  owner        text,
  due_date     date,
  consequence  text,
  status       text not null default 'open',  -- open | closed | lapsed
  closed_by    text,
  closed_at    timestamptz,
  created_at   timestamptz not null default now()
);

create table approvals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  decision     text not null,  -- approved | approved_with_conditions | pilot_only | remediation_required | not_approved | risk_accepted
  rationale    text,
  approver     text not null,
  created_at   timestamptz not null default now()
);

-- ============================================================ tasks & engagements
create table tasks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid references use_cases(id) on delete cascade,
  type         text not null default 'adhoc',  -- question | evidence | condition | roadmap | adhoc
  ref_id       uuid,                           -- id of the linked object
  title        text not null,
  assignee     text,
  due_date     date,
  status       text not null default 'open',   -- open | in_progress | done | cancelled
  external_ref jsonb,                          -- jira/servicenow link (phase 3)
  created_by   text not null,
  created_at   timestamptz not null default now()
);

create table engagements (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid references use_cases(id),
  type         text not null default 'expert_review', -- expert_review | assessment | advisory
  scope        text,
  status       text not null default 'requested',     -- requested | active | complete
  neo_user     text,
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz not null default now()
);

-- ============================================================ audit & usage
create table audit_events (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  actor       text not null,           -- clerk user id or 'engine'
  action      text not null,           -- e.g. use_case.create, stage.gate_confirm
  object_type text,
  object_id   text,
  detail      jsonb,
  at          timestamptz not null default now()
);
-- append-only: no update/delete grants, ever (enforced at role level too)

create table usage_records (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references organizations(id) on delete cascade,
  period        text not null,         -- YYYY-MM
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  assessments_run int not null default 0,
  unique (org_id, period)
);

-- ============================================================ indexes
create index on workspaces (org_id);
create index on use_cases (org_id, status);
create index on stage_records (org_id, use_case_id);
create index on questions (org_id, use_case_id, status);
create index on control_items (org_id, use_case_id);
create index on evidence_items (org_id, use_case_id, status);
create index on assurance_tests (org_id, use_case_id);
create index on conditions (org_id, use_case_id, status);
create index on approvals (org_id, use_case_id);
create index on tasks (org_id, assignee, status);
create index on audit_events (org_id, at desc);

-- ============================================================ RLS: deny-all
-- All access is via server routes using the service role (bypasses RLS).
-- Enabling RLS with no policies = anon/authenticated roles see nothing.
-- Phase 2: add Clerk third-party JWT integration + org-scoped policies.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
