-- 0092_pal_frontier.sql
-- The continuous frontier — PAL never stops.
--
-- A scheduled sweep runs the adversary against every authorized target and records a metric snapshot, so the
-- frontier is a live surface rather than a one-off run. Two honest headline numbers:
--   hold_rate     = share of discovered paths a Gravity constitution would hold (the resolution rate)
--   novelty_rate  = share not named in the public canon at discovery (how far ahead of the frameworks we are)
-- plus new_last_7d = paths first seen in the last week (the frontier moving on its own as targets are added
-- and — once live re-validation runs — as patched surfaces keep failing).

create table if not exists pal_frontier_metrics (
  metric_id     uuid primary key default gen_random_uuid(),
  captured_at   timestamptz not null default now(),
  targets_run   int not null default 0,
  paths_total   int not null default 0,
  paths_novel   int not null default 0,
  paths_held    int not null default 0,
  new_last_7d   int not null default 0,
  novelty_rate  numeric not null default 0,   -- 0..1
  hold_rate     numeric not null default 0    -- 0..1
);
create index if not exists pal_frontier_metrics_idx on pal_frontier_metrics(captured_at desc);
alter table pal_frontier_metrics enable row level security;  -- deny-all; service role only

comment on table pal_frontier_metrics is
  'Point-in-time snapshots from the continuous frontier sweep. Surfaced as the public frontier headline (hold rate, novelty rate, breaks discovered). Written by the scheduled sweep only.';
