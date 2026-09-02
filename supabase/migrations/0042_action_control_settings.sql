-- 0042_action_control_settings.sql — per-control governance for the DISRUPT surface.
--
-- The Disrupt table previously listed only seeded *integrations* (2 per use case).
-- It now lists EVERY control the assessment produced for a use case, and lets the
-- customer choose how Neo governs each one:
--   - enforceable (runtime) controls — pillars 4/5/6 — get an enforcement mode:
--       shadow | approve | autonomous
--   - all other controls get a validation posture:
--       monitor | validate
--
-- Settings are keyed by (org, use_case, pillar, control name) so they survive a
-- controls regeneration (control_items rows are recreated, but the name+pillar
-- identity is stable). Service-role only (RLS deny-all), like the rest of the fabric.

create table if not exists action_control_settings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  pillar       int  not null check (pillar between 1 and 10),
  control      text not null,
  gov_enabled  boolean not null default true,
  gov_mode     text,              -- shadow | approve | autonomous | monitor | validate
  updated_by   text,
  updated_at   timestamptz not null default now()
);

create unique index if not exists action_control_settings_key
  on action_control_settings(org_id, use_case_id, pillar, control);

alter table action_control_settings enable row level security;
