-- 0088_pal_responsible_adversary.sql
-- Neo PAL — the Responsible Adversary.
--
-- "I make things and I break things, then I make things that break things."
--
-- PAL attacks real published agentic surfaces (MCP servers, agent frameworks, products) to demonstrate,
-- publicly and reproducibly, that point-fixes don't hold — and that a Gravity constitution does. The word
-- "responsible" is not a slogan here; it is enforced by the schema. A run CANNOT exist without an
-- authorization record establishing the legal basis to test the target. There are exactly three bases:
--
--   self_owned          — Neo runs the target itself (open-source MCP server, our own deploy). Always legal.
--   written_permission  — the owner gave explicit written authorization (contract, email, engagement).
--   bug_bounty          — a named public program whose scope + rules cover this target.
--
-- pal_runs.authorization_id is NOT NULL with a FK: it is structurally impossible to record an attack that
-- isn't tied to a basis. Everything downstream (findings, publication) inherits that provenance.

-- ── targets ────────────────────────────────────────────────────────────────
-- A real surface we may attack. Neo-owned public targets have org_id null.
create table if not exists pal_targets (
  target_id    uuid primary key default gen_random_uuid(),
  org_id       uuid references organizations(id) on delete cascade,   -- null = Neo-owned public target
  name         text not null,
  kind         text not null,                       -- mcp_server | agent_framework | product
  vendor       text,                                -- who makes it (for disclosure/credit)
  source_url   text,                                -- repo / manifest / product URL
  manifest     jsonb not null default '{}'::jsonb,  -- the ingested capability surface (MCP tool list, etc.)
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists pal_targets_org_idx on pal_targets(org_id, created_at desc);
alter table pal_targets enable row level security;

-- ── authorizations — the legitimacy record ─────────────────────────────────
-- Every run points at one of these. No authorization, no run. Verified + expiry so a lapsed permission
-- can't be reused indefinitely.
create table if not exists pal_authorizations (
  authorization_id uuid primary key default gen_random_uuid(),
  target_id        uuid not null references pal_targets(target_id) on delete cascade,
  basis            text not null,        -- self_owned | written_permission | bug_bounty
  program_name     text,                 -- bug-bounty program or engagement name
  scope_url        text,                 -- program scope / statement of work
  rules_url        text,                 -- program rules / safe-harbor terms
  granted_by       text,                 -- who authorized (owner contact, program handle)
  evidence         jsonb not null default '{}'::jsonb,  -- links, ticket ids, signed-doc refs
  live_execution   boolean not null default false,      -- may we actually CALL the target, not just model it
  verified         boolean not null default false,      -- an operator confirmed the basis is real
  expires_at       timestamptz,
  created_by       text,
  created_at       timestamptz not null default now()
);
create index if not exists pal_authorizations_target_idx on pal_authorizations(target_id);
alter table pal_authorizations enable row level security;

comment on table pal_authorizations is
  'The legal basis to test a target. pal_runs.authorization_id references this NOT NULL, so no attack can be recorded without one. live_execution gates whether PAL may actually invoke the target (vs only modelling its published surface); it requires self_owned or an explicit written/bounty grant.';

-- ── runs — an adversary session against a target under an authorization ─────
create table if not exists pal_runs (
  run_id            uuid primary key default gen_random_uuid(),
  target_id         uuid not null references pal_targets(target_id) on delete cascade,
  authorization_id  uuid not null references pal_authorizations(authorization_id),  -- NO run without a basis
  org_id            uuid references organizations(id) on delete cascade,
  execution_mode    text not null default 'twin',   -- twin (model the surface) | live (invoke the target)
  status            text not null default 'running', -- running | complete | failed | refused
  refusal_reason    text,                            -- why a run was refused (e.g. live without live grant)
  time_to_first_break_ms bigint,                     -- the visceral "broke in X" number (search time)
  paths_found       int not null default 0,
  paths_held        int not null default 0,          -- paths a Gravity constitution would stop
  actor             text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz
);
create index if not exists pal_runs_target_idx on pal_runs(target_id, started_at desc);
create index if not exists pal_runs_org_idx on pal_runs(org_id, started_at desc);
alter table pal_runs enable row level security;

comment on column pal_runs.execution_mode is
  'twin = PAL reasons over the target''s published surface (fully legal, reproducible, no network exploitation). live = PAL actually invokes the target''s tools — permitted only when the authorization has live_execution = true.';

-- ── findings — individual attack paths ─────────────────────────────────────
create table if not exists pal_findings (
  finding_id        uuid primary key default gen_random_uuid(),
  run_id            uuid not null references pal_runs(run_id) on delete cascade,
  target_id         uuid not null references pal_targets(target_id) on delete cascade,
  title             text not null,
  attack_class      text not null,          -- tool_poisoning | confused_deputy | unbounded_authority | silent_exfil | ...
  severity          text not null,          -- low | medium | high | critical
  method            jsonb not null default '[]'::jsonb,   -- ordered steps of the path
  outcome           text not null,          -- broke | held
  -- novelty, checked at time of discovery against the public canon + our own library:
  novelty           jsonb not null default '{}'::jsonb,   -- { isNovel, checkedAgainst[], matchedRef }
  -- the resolution: which Gravity constitution rule holds this, proving governance beats patching:
  held_by_gravity   boolean not null default false,
  gravity_rule      jsonb,                  -- { appliesTo, effect, obligation }
  -- responsible disclosure lifecycle:
  disclosure_status text not null default 'private',  -- private | disclosed | acknowledged | public
  public_slug       text unique,            -- set when published
  published_at      timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists pal_findings_run_idx on pal_findings(run_id);
create index if not exists pal_findings_public_idx on pal_findings(disclosure_status, published_at desc);
alter table pal_findings enable row level security;

comment on table pal_findings is
  'One attack path. Carries its novelty check (recorded at discovery, not asserted later) and the Gravity rule that would hold it. disclosure_status drives what is public: only status = public findings appear on the public frontier, and even then the public projection omits the full method until a viewer signs in.';
