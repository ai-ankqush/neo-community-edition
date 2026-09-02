-- 0083_sky_identity_selfserve.sql
-- Self-serve identity for Neo Sky: verified SSO domains + service keys for machines with no IdP.
--
-- 1) DOMAIN OWNERSHIP. Home-realm discovery means whoever claims an email domain gets to point that
--    domain's people at their IdP. Unverified, that's a phishing vector (claim acme.com, and Acme staff
--    typing their email are offered YOUR identity provider). So a connection may only go live once the
--    tenant proves control of the domain via a DNS TXT record at _neo-verify.<domain>.
--
-- 2) SERVICE KEYS. A customer whose agents have no corporate IdP still needs machine credentials. Neo
--    issues scoped, revocable keys (shown once, stored only as a SHA-256 hash) that resolve to the same
--    neutral Principal as any other caller.

alter table sky_sso_connections add column if not exists verification_token text;
alter table sky_sso_connections add column if not exists verified_at timestamptz;

-- Machine credentials for tenants without their own IdP.
create table if not exists sky_service_keys (
  key_id       uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  key_prefix   text not null,              -- first chars, for display only ("nsk_a1b2…")
  key_hash     text not null unique,       -- sha256 of the full key; the key itself is never stored
  role         text not null default 'assessor',  -- platform role this key acts as
  created_by   uuid references sky_users(user_id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists sky_service_keys_org_idx on sky_service_keys(org_id, created_at desc);
create index if not exists sky_service_keys_hash_idx on sky_service_keys(key_hash);
alter table sky_service_keys enable row level security;  -- deny-all; service role only
