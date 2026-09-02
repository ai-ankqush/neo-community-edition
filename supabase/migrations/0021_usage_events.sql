-- 0021: fine-grained usage events for FinOps.
-- Records one row per engine call with the use case, stage, model, and tokens,
-- so /admin/finops can break spend down per use case and per stage (incl. Red
-- Team). Append-only. The org-level monthly rollup in usage_records is unchanged.
-- Populates from this release onward (no historical per-use-case data exists).

create table if not exists usage_events (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references organizations(id) on delete cascade,
  use_case_id   uuid references use_cases(id) on delete set null,
  stage         text not null,                 -- classify, controls, red_team, artifacts, report_query, ...
  model         text not null default '',
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists usage_events_org_idx on usage_events (org_id);
create index if not exists usage_events_uc_idx on usage_events (use_case_id);
create index if not exists usage_events_stage_idx on usage_events (stage);
create index if not exists usage_events_created_idx on usage_events (created_at);
