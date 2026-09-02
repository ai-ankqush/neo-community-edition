-- 0063: Neo Red Team — Live Fire (the Judgement Engine at work).
--
-- This is the LIVE side of Red Team: Neo actually attacks a connected AI target
-- and records what happened. It complements (does not replace) the grounded
-- attack-path map in red_team_findings (0018) + the derived scenario player.
--
-- Positioning (locked): NEVER "agentic". Neo's value-add is JUDGEMENT — PAL
-- decides which grounded batteries matter for THIS AI and why; a judge then
-- scores what actually broke. Competitors brute-force possibility; we reason.
--
-- SAFETY / HONESTY BY DESIGN:
--  * Every run is authorization-gated (own-AI attestation captured here).
--  * Attempt-and-detect only — destructive intent is scored, never executed.
--  * Transcripts are redacted before storage (no raw secrets / real PII).
--  * A result is "confirmed" only when the attack demonstrably succeeded live;
--    grounded-but-untested paths are never implied as proven.

create table if not exists red_team_runs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  use_case_id       uuid references use_cases(id) on delete set null,

  -- how Neo reached the target
  target_method     text not null default 'endpoint',  -- endpoint | mcp | sandbox | public
  target_label      text,                               -- human name of the target (no secrets)
  connection_id     uuid,                               -- optional org_connections link

  -- authorization (Sentinel authorized-adversary pattern)
  authorized_by     text not null,                      -- user id who attested own-AI authority
  authorized_at     timestamptz not null default now(),
  authorization_note text,

  -- lifecycle
  status            text not null default 'queued',     -- queued | running | complete | failed | cancelled
  mode              text not null default 'attempt_detect', -- attempt_detect (never execute) | sandbox
  batteries         jsonb not null default '[]'::jsonb,  -- battery keys selected (grounded)
  selection_reason  text,                                -- why these batteries (the judgement, in words)

  -- rollup
  attempted         int not null default 0,
  confirmed         int not null default 0,
  blocked           int not null default 0,
  inconclusive      int not null default 0,

  error             text,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_red_team_runs_org      on red_team_runs (org_id);
create index if not exists idx_red_team_runs_uc       on red_team_runs (org_id, use_case_id);
create index if not exists idx_red_team_runs_status   on red_team_runs (org_id, status);

create table if not exists red_team_results (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references red_team_runs(id) on delete cascade,
  org_id            uuid not null references organizations(id) on delete cascade,

  battery           text not null,          -- prompt_injection | jailbreak | data_exfiltration | tool_abuse
  attack_ref        text,                   -- template id within the battery
  title             text not null,
  owasp_ref         text,
  atlas_ref         text,

  verdict           text not null default 'inconclusive', -- confirmed | blocked | inconclusive
  severity          text,                   -- critical | high | medium | low
  judge_reason      text,                   -- one-line why (from the judge)
  transcript        jsonb not null default '[]'::jsonb,   -- REDACTED prompt/response pairs
  mapped_control    text,                   -- the control that would/did break it
  remediation       text,

  -- ties the live result back to a grounded path on the Findings view (optional)
  grounded_path_id  text,

  created_at        timestamptz not null default now()
);

create index if not exists idx_red_team_results_run   on red_team_results (run_id);
create index if not exists idx_red_team_results_org   on red_team_results (org_id, battery);

alter table red_team_runs    enable row level security;
alter table red_team_results enable row level security;

comment on table red_team_runs is
  'Neo Red Team Live Fire runs. Authorization-gated, attempt-and-detect only (never executes destructive actions). Judgement-led: batteries are PAL-selected for the specific AI. Never "agentic".';
comment on table red_team_results is
  'Per-attack results of a Live Fire run. Transcripts are redacted (no raw secrets/PII). verdict=confirmed only when the attack succeeded live.';
