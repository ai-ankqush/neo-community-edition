-- 0018: Red Team findings. Per-use-case attack paths, each scored against the
-- use case's current control posture (Enterprise feature).

create table if not exists red_team_findings (
  id                bigint generated always as identity primary key,
  org_id            uuid not null references organizations(id) on delete cascade,
  use_case_id       uuid not null references use_cases(id) on delete cascade,
  vector            text not null,            -- see | decide | do
  technique         text not null,
  scenario          text not null,
  unguarded_outcome text,
  severity          text not null,            -- critical | high | medium | low
  owasp_ref         text,
  atlas_ref         text,
  blocking_pillar   int,
  blocking_control  text,
  exposure          text not null,            -- exposed | partial | blocked
  generated_at      timestamptz not null default now()
);
create index on red_team_findings (org_id, use_case_id);
alter table red_team_findings enable row level security;

-- when Red Team was last run for a use case (for the staleness / "run" state)
alter table use_cases add column if not exists red_team_at timestamptz;
