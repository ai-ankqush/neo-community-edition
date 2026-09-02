-- 0108: per-customer heartbeat detail.
-- The partner heartbeat can send a per-customer breakdown (org name, tier, use-case count) so the
-- owner's control plane can reconcile revenue-share (e.g. 70/30). Stored as the latest snapshot.
alter table partners
  add column if not exists customers jsonb;
