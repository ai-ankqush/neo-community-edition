-- 0107: partner heartbeat metrics.
-- A white-label partner deployment periodically POSTs aggregate counts (sign-ups, usage) to
-- /api/partners/heartbeat on the owner instance. We store the latest snapshot on the partner row
-- so the central control plane can show it. Aggregates only — no tenant content leaves the partner.
alter table partners
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists metrics jsonb;
