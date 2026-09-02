-- 0096_pal_disclosure_rebreak.sql
-- Responsible disclosure + the re-break loop — the whack-a-mole proof.
--
-- The thesis: point-fixes don't hold; governing the authority does. This table makes it a tracked workflow, not
-- a slide. When PAL finds a real break, the RESPONSIBLE PARTY (vendor / target owner) is told and ships their
-- fix. Then PAL loads the PATCHED manifest and breaks it again — a different composition the patch didn't
-- anticipate. Each re-break is linked here, so one disclosure can carry a chain of "they patched, we broke it
-- again" — the evidence that only the one authored Gravity rule holds across every patch.
--
-- Lifecycle: open → acknowledged → fixed → rebroken (→ back to fixed on the next patch, looping) → governance_held
-- (the terminal, honest resolution: the vendor can keep patching, but the Gravity rule is what actually holds).

create table if not exists pal_disclosures (
  disclosure_id  uuid primary key default gen_random_uuid(),
  finding_id     uuid not null references pal_findings(finding_id) on delete cascade,   -- the original break
  target_id      uuid not null references pal_targets(target_id) on delete cascade,

  -- the responsible party (never fabricated — a real contact / program)
  disclosed_to   text,                    -- vendor security contact / handle
  program        text,                    -- bug-bounty program or coordinated-disclosure channel
  advisory_url   text,                    -- their published advisory / fix, once it exists

  status         text not null default 'open',   -- open | acknowledged | fixed | rebroken | governance_held
  disclosed_at   timestamptz not null default now(),
  acknowledged_at timestamptz,
  fixed_at       timestamptz,

  -- the whack-a-mole evidence: PAL runs against successive PATCHED manifests
  rebreak_run_ids jsonb not null default '[]'::jsonb,   -- pal_runs.run_id[] that broke a patched version
  rebreak_count   int not null default 0,

  -- the resolution that actually holds, independent of any patch
  gravity_rule   jsonb,

  created_by     text,
  notes          text
);
create index if not exists pal_disclosures_finding_idx on pal_disclosures(finding_id);
create index if not exists pal_disclosures_status_idx on pal_disclosures(status, disclosed_at desc);
alter table pal_disclosures enable row level security;   -- deny-all; service role only

comment on table pal_disclosures is
  'Responsible-disclosure + re-break tracking. A disclosure links the original break to the vendor''s fixes and to each PAL run that broke a patched version. rebreak_count is the whack-a-mole tally; status = governance_held is the terminal resolution (the Gravity rule holds where patching does not).';
