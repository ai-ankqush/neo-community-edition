-- Control verification columns on control_items.
--
-- These columns are read/written by the control-verification, evidence, and
-- red-team stages (control-graph, calibration, composer verify, report). In the
-- managed Supabase they were added out-of-band and never captured as a tracked
-- migration, so a fresh `ce-migrate` (every self-host) was missing them, causing
-- `column "verification_status" of relation "control_items" does not exist`.
-- Idempotent so it is safe to re-run and safe on environments that already have them.

alter table control_items add column if not exists verification_status text;   -- unverified | verified | partial | failed
alter table control_items add column if not exists verified_at        timestamptz;
alter table control_items add column if not exists verification_note   text;
alter table control_items add column if not exists verified_by         text;    -- user id / connector that set verified

create index if not exists control_items_verification_status_idx
  on control_items (org_id, verification_status);
