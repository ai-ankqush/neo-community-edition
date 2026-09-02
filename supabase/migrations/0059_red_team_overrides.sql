-- Red Team — manual "control in place" override per finding.
-- The status auto-derives from exposure (blocked = control verified). This lets a
-- human also mark a finding addressed when they know the control is in place even if
-- Neo hasn't verified it live. Keyed by the finding's stable identity so it survives
-- a Red Team re-run (which regenerates red_team_findings rows).
create table if not exists red_team_overrides (
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null,
  vector       text not null,
  technique    text not null,
  addressed    boolean not null default true,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  primary key (org_id, use_case_id, vector, technique)
);

alter table red_team_overrides enable row level security;
-- Deny-all to anon/authenticated; the app reaches this only via the service role.
