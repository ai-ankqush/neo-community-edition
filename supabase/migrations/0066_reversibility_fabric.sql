-- 0066_reversibility_fabric.sql
-- Reversibility Fabric phase 1: every Action-Fabric decision now records whether the
-- action can be taken back (shadow signal — never changes the verdict yet), and
-- reversible/compensatable actions arm a recovery-ledger row (the "way back").
-- See docs/REVERSIBILITY-FABRIC-DESIGN.md.

-- Shadow signal on the existing decision row (additive, nullable — no backfill needed).
alter table action_decisions add column if not exists reversibility       text;   -- reversible | compensatable | irreversible
alter table action_decisions add column if not exists severity            text;   -- trivial | moderate | severe
alter table action_decisions add column if not exists reversal_gate       text;   -- auto | undo_armed | simulate_then_human | human_only
alter table action_decisions add column if not exists reversal_confidence numeric; -- reserved for the PAL reversibility head (BlackC); null until wired

-- The recovery ledger — the pre-computed way back, armed BEFORE the action commits.
create table if not exists action_reversals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  decision_id    uuid references action_decisions(id) on delete set null,
  use_case_id    uuid not null,
  provider       text not null,
  action_class   text not null,
  action_label   text not null,
  reversibility  text not null,           -- reversible | compensatable | irreversible
  severity       text not null,           -- trivial | moderate | severe
  confidence     numeric not null default 0,
  mechanism      text,                    -- plain-language way back
  prior_state    jsonb,                   -- reference/snapshot needed to restore (NOT raw records)
  plan           jsonb,                   -- compensating steps (customer-executed via PEP)
  status         text not null default 'armed',
    -- armed | executed_action | rolled_back | expired | irreversible_committed | failed
  armed_at       timestamptz not null default now(),
  window_expires timestamptz,             -- undo decays; honest about when the way back is gone
  reversed_at    timestamptz,
  reversed_by    text,                    -- clerk user id or 'neo:auto'
  created_at     timestamptz not null default now()
);
create index if not exists action_reversals_org_idx    on action_reversals (org_id, created_at desc);
create index if not exists action_reversals_status_idx on action_reversals (org_id, status);
create index if not exists action_reversals_decision_idx on action_reversals (decision_id);

alter table action_reversals enable row level security;  -- server-only (service role), like the rest of the fabric
