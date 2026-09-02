-- 0041_action_fabric_ingest.sql — AI Action Fabric: real action-stream ingestion.
--
-- Three front-doors (SDK / MCP proxy / audit-log collector) all POST to one
-- /decide (or /ingest) endpoint, authenticated by a per-org ingest key. The
-- engine runs server-side, times the decision, and records it — so decisions
-- and latency become real (not simulated) once a stream is connected.
-- Service-role only (RLS deny-all).

-- per-org ingest key (store only a hash; show the secret once on creation)
create table if not exists action_ingest_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  key_hash     text not null,          -- sha256 of the secret
  key_prefix   text not null,          -- first chars, shown in UI to identify it
  label        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked      boolean not null default false
);
create index if not exists action_ingest_keys_org on action_ingest_keys(org_id);
create unique index if not exists action_ingest_keys_hash on action_ingest_keys(key_hash);
alter table action_ingest_keys enable row level security;

-- decisions gain a real source + measured latency (simulated rows keep latency null)
alter table action_decisions
  add column if not exists source text not null default 'simulated', -- simulated|sdk|mcp|logs
  add column if not exists latency_ms int;
