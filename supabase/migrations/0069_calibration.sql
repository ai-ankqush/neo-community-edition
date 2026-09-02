-- 0069_calibration.sql
-- CALIBRATED PREDICTION — Neo commits, in advance, to falsifiable claims about what will happen,
-- and then publishes its own hit rate.
--
-- Why this table exists rather than scoring dissents alone: a dissent mostly resolves by a HUMAN
-- agreeing or overruling, which scores Neo on the human's agreement, not on reality. That is the
-- sycophancy trap. These predictions resolve THEMSELVES — a verification check runs, a Red Team
-- run happens, a clock expires — so the ground truth arrives without anyone adjudicating it, and
-- nobody (including us) can fudge the denominator.
--
-- The rule that makes it honest: a prediction is only scoreable if it was made STRICTLY BEFORE the
-- event that settled it (created_at < resolved-by evidence timestamp). Enforced in the resolver.

create table if not exists predictions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  use_case_id   uuid references use_cases(id) on delete cascade,

  kind          text not null,          -- control_verify_fail | redteam_still_exposed | evidence_never_arrives | dissent
  claim         text not null,          -- plain English, stated BEFORE the fact
  basis         text not null,          -- why Neo thinks so (shown to the user; keeps it defensible)
  confidence    numeric not null,       -- 0..1 — the number Neo is held to
  subject_ref   text,                   -- control_items.id / red_team_findings.id / dissents.id
  subject_label text,                   -- human-readable ("Prompt injection filter")

  status        text not null default 'open',   -- open | resolved | expired
  outcome       text,                   -- correct | incorrect  (null while open)
  resolved_at   timestamptz,
  resolved_by   text,                   -- verification | redteam_run | clock | human  — HOW truth arrived
  resolution_note text,

  expires_at    timestamptz,            -- for clock-resolved kinds
  fingerprint   text not null,          -- one prediction per subject per claim — no double-counting
  created_at    timestamptz not null default now(),
  unique (org_id, fingerprint)
);
create index if not exists predictions_org_status_idx on predictions (org_id, status, created_at desc);
create index if not exists predictions_subject_idx on predictions (org_id, kind, subject_ref);

alter table predictions enable row level security;  -- server-only (service role), like the rest

-- NOTE ON PRIVACY / THE CROSS-CUSTOMER NUMBER:
-- These rows are per-org and stay in the customer's own tenant. If Neo ever publishes a fleet-wide
-- calibration number, it must be computed from DERIVED AGGREGATES (counts of correct/incorrect per
-- confidence bucket per kind) — never raw claims, control names, or findings, which are customer
-- estate detail. Same give-to-get discipline as the frontier/fleet-immunity work.
