-- 0097_pal_search_persistence.sql
-- "Don't give up" — the persistent search summary on every run.
--
-- PAL's hunt no longer stops at the first hostile composition and no longer quits when nothing pairs up. It
-- treats the model's hostility score as a CONTINUOUS reward, keeps a quality-diversity archive so it explores
-- new compositions instead of repeating, and hill-climbs (greedily extends the strongest partial chains)
-- until it either breaks in or spends its evaluation budget. Recorded here per run:
--
--   compositions_tried  — how hard it looked
--   closest_approach    — the highest hostility it reached (a break if >= threshold; otherwise the residual)
--   archive_coverage    — distinct behavioural cells explored (breadth of the search)
--   search_verdict      — 'broke' | 'secure_within_budget'  ← the SECOND is the assurance product:
--                          "PAL tried N compositions and could not break it" is a certificate, not a failure.

alter table pal_runs add column if not exists compositions_tried int;
alter table pal_runs add column if not exists closest_approach numeric;
alter table pal_runs add column if not exists archive_coverage int;
alter table pal_runs add column if not exists search_verdict text;   -- broke | secure_within_budget

comment on column pal_runs.search_verdict is
  'broke = the persistent search reached a hostile composition; secure_within_budget = it could not, within its evaluation budget — a verified-secure attestation (the product value of a non-break).';
