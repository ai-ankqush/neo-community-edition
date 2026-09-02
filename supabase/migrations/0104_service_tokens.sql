-- 0104_service_tokens.sql
-- Per-org service tokens for the Neo agent (the orb / ambient layer) to call the platform's
-- /api/agent/* endpoints machine-to-machine. The token is stored only as a SHA-256 hash; the raw
-- token is shown once at mint time. These endpoints are a v2 feature gated to DEMO orgs only — the
-- gate is enforced in code (requireServiceToken checks organizations.is_demo), but keep tokens scarce.
create table if not exists service_tokens (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  token_hash   text not null,              -- sha256(hex) of the raw token; raw is never stored
  label        text,                       -- e.g. "Neo agent"
  created_by   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked      boolean not null default false
);
create unique index if not exists service_tokens_hash_uniq on service_tokens (token_hash);
create index if not exists service_tokens_org_idx on service_tokens (org_id);
alter table service_tokens enable row level security;

comment on table service_tokens is
  'Per-org bearer tokens for the Neo agent to call /api/agent/* (v2, demo-org-gated). Stored as a sha256 hash; raw shown once.';
