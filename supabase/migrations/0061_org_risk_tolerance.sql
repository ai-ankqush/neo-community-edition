-- 0061: per-risk-tier acceptable control-coverage targets (the org's risk appetite).
-- The advanced-dashboard coverage bar colours relative to these instead of a fixed scale,
-- so "80% covered" can be a pass for one business and a fail for another. Editable in Settings.
-- Defaults scale with tier (Neo principle: control depth scales with risk).

alter table organizations
  add column if not exists risk_tolerance jsonb not null
  default '{"1":50,"2":65,"3":80,"4":90,"5":95}'::jsonb;

comment on column organizations.risk_tolerance is
  'Per-risk-tier acceptable control-coverage targets, percent. Keys "1".."5" map to the use-case tier. The coverage bar is green at/above the target for that tier; a Tier 4-5 use case with an outright control gap cannot go green even if the percentage clears. Editable in Settings.';
