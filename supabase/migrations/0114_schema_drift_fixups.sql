-- Schema-drift fixups: columns/tables the code reads/writes that no migration
-- ever created (added out-of-band to the managed Supabase over time). A fresh
-- `ce-migrate` — what every self-host runs — was missing them, so the affected
-- features would 500 or silently swallow errors. Idempotent + safe to re-run.

-- 1) control_items.verification_mode
--    Written by /api/controls/[id] (verification_mode: "manual") and read by the
--    Evidence page's control list. Without it, saving/verifying a control 500s.
alter table control_items add column if not exists verification_mode text;   -- manual | live

-- 2) slot_consumptions
--    Read (maybeSingle) + inserted by /api/assess (per-use-case usage analytics),
--    and selected by the Use Cases list page. Missing today, so those queries
--    error silently: analytics never record and the DB logs an error per assess.
create table if not exists slot_consumptions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  use_case_id    uuid references use_cases(id) on delete cascade,
  use_case_name  text,
  period         text,
  created_at     timestamptz not null default now()
);
create index if not exists slot_consumptions_org_idx on slot_consumptions (org_id);
create unique index if not exists slot_consumptions_org_uc_idx
  on slot_consumptions (org_id, use_case_id);
