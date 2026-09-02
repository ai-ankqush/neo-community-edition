-- 0052_fleet_pattern_library.sql
-- AI Action Fabric — fleet collective immunity (BlackC chunk 6, productised).
--
-- Cross-customer learning WITHOUT pooling raw data. The ONLY thing that crosses
-- between orgs is the de-identified behavioural layer: a pattern = a sorted list
-- of behavioural FEATURE NAMES (from the fixed 18-feature space) + a foothold
-- bit + control META (pillar + governed feature names). No labels, no use-case
-- names, no org id — the contributor is an opaque hash. Enforced in code at the
-- boundary (src/server/action-control/fleet.ts).
--
-- k-anonymity: a pattern only becomes "shared" once >= k DISTINCT contributors
-- have independently reported it, so it's never attributable to one org. A
-- singleton stays private to its origin.

-- opt-in flag (default OFF — local-only until the org chooses to join the fleet)
alter table organizations
  add column if not exists fleet_opt_in boolean not null default false;

create table if not exists fleet_pattern_contributions (
  id                uuid primary key default gen_random_uuid(),
  sig_hash          text not null,          -- sha256 of the canonical feature list
  sig               text[] not null,        -- sorted behavioural feature NAMES (∈ the 18)
  foothold          boolean not null default false,
  pillar            int,                    -- governing control's pillar (number only)
  governs           text[] not null default '{}', -- governed feature NAMES (∈ the 18)
  contributor_token text not null,          -- opaque sha256 of the org id — never the org id
  created_at        timestamptz not null default now(),
  unique (sig_hash, contributor_token)      -- one vote per org per pattern (k-anonymity counts distinct orgs)
);
create index if not exists fleet_patterns_sig on fleet_pattern_contributions (sig_hash);
alter table fleet_pattern_contributions enable row level security; -- service-role only; deny-all
