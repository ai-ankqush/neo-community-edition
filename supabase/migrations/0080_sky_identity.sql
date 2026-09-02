-- 0080_sky_identity.sql
-- Neo Sky — Neo-native identity spine. NO Clerk, no identity vendor.
--
-- Sky is the customer product: humans sign up here and author their tenant overlay (bend the rules within
-- the limits Gravity dictates). Their login must never depend on a vendor we don't control — so Sky runs
-- its own accounts, credentials, and sessions, all keyed to the NEUTRAL tenant (organizations.id).
--
-- Three local credential methods are supported (password, passkey, and magic-link tokens), plus enterprise
-- SSO later (Sky as its own OIDC relying-party). Everything resolves to the same neutral Principal the rest
-- of the platform already speaks.
--
-- Scope: Sky only. Neo Control keeps using Clerk for now; these tables are independent of it.

-- A Sky human account. Email is the stable handle; identity is neutral (no provider id).
create table if not exists sky_users (
  user_id        uuid primary key default gen_random_uuid(),
  email          text not null,
  email_verified boolean not null default false,
  display_name   text,
  status         text not null default 'active',   -- active | disabled
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists sky_users_email_lower_idx on sky_users (lower(email));
alter table sky_users enable row level security;  -- deny-all; service role only

-- Sky's own membership: which neutral org a user belongs to, and their platform role.
create table if not exists sky_memberships (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references sky_users(user_id) on delete cascade,
  role       text not null default 'viewer',       -- org_admin | assessor | contributor | viewer
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists sky_memberships_user_idx on sky_memberships(user_id);
alter table sky_memberships enable row level security;  -- deny-all; service role only

-- Stored credentials: password (scrypt hash in data) or passkey (WebAuthn public key + counter in data).
-- Magic-links are one-time tokens (below), not stored credentials.
create table if not exists sky_credentials (
  credential_id uuid primary key default gen_random_uuid(),
  user_id       uuid not null references sky_users(user_id) on delete cascade,
  method        text not null check (method in ('password', 'passkey')),
  data          jsonb not null,                     -- password: {alg,hash}; passkey: {credentialId,publicKey,counter,transports}
  label         text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
-- One password per user; passkey credential ids are globally unique.
create unique index if not exists sky_credentials_one_password_idx on sky_credentials(user_id) where method = 'password';
create unique index if not exists sky_credentials_passkey_id_idx on sky_credentials((data->>'credentialId')) where method = 'passkey';
create index if not exists sky_credentials_user_idx on sky_credentials(user_id);
alter table sky_credentials enable row level security;  -- deny-all; service role only

-- One-time magic-link / email-verification tokens. Only the SHA-256 of the token is stored.
create table if not exists sky_magic_links (
  token_hash  text primary key,
  user_id     uuid not null references sky_users(user_id) on delete cascade,
  purpose     text not null default 'login',        -- login | verify
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists sky_magic_links_user_idx on sky_magic_links(user_id);
alter table sky_magic_links enable row level security;  -- deny-all; service role only

-- Server-side, revocable sessions. The cookie carries only a signed reference to a row here, so a session
-- can be killed instantly (logout, admin revoke) regardless of cookie expiry.
create table if not exists sky_sessions (
  session_id   uuid primary key default gen_random_uuid(),
  user_id      uuid not null references sky_users(user_id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_seen_at timestamptz not null default now(),
  user_agent   text,
  ip           text
);
create index if not exists sky_sessions_user_idx on sky_sessions(user_id);
alter table sky_sessions enable row level security;  -- deny-all; service role only
