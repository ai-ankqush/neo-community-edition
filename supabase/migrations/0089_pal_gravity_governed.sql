-- 0089_pal_gravity_governed.sql
-- Neo PAL is itself governed by Gravity.
--
-- The use of the Responsible Adversary is not free-hand: beyond the per-target authorization (the legal
-- basis), every run passes through Gravity's OWN decision gate before it may proceed, and the resulting
-- decision id is recorded here. This is deliberate dogfooding — Neo's most dangerous internal capability is
-- bound by the same kernel it sells. Twin runs classify as a read (permitted, but recorded in Gravity's
-- decision + evidence ledgers); live runs classify as irreversible, so Gravity REQUIRES explicit human
-- authorization — PAL cannot invoke a real target without a person clearing it through the kernel.

alter table pal_runs add column if not exists gravity_decision_id uuid;

comment on column pal_runs.gravity_decision_id is
  'The Gravity gate decision that governed this run. Every PAL run is adjudicated by Gravity before it executes; twin = read (allowed + recorded), live = irreversible (requires human authorization). Null only if governance was unreachable, in which case the run is refused.';
