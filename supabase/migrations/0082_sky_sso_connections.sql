-- 0082_sky_sso_connections.sql
-- Neo Sky — enterprise SSO connections (Sky as its own OIDC relying-party) + home-realm discovery.
--
-- A tenant registers its own OIDC provider here, keyed by the email DOMAIN of its people. When someone
-- enters their work email on the Sky login page, we look up the domain: if a connection exists, we show
-- "SSO configured — continue with SSO" instead of a password. Sky is the relying-party (auth-code + PKCE);
-- the ID token is verified against the issuer's JWKS with the same code the Gravity path already uses.
--
-- This migration lands the table + discovery now; the redirect/callback flow is Phase 3.

create table if not exists sky_sso_connections (
  connection_id           uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references organizations(id) on delete cascade,
  email_domain            text not null,                 -- lowercased; the home-realm key
  display_name            text not null,                 -- e.g. "Acme (Okta)"
  issuer                  text not null,
  client_id               text,
  client_secret           text,                          -- confidential client (server-side only)
  authorization_endpoint  text,
  token_endpoint          text,
  jwks_url                text,
  scopes                  text not null default 'openid email profile',
  subject_claim           text not null default 'sub',
  email_claim             text not null default 'email',
  enabled                 boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index if not exists sky_sso_connections_domain_idx on sky_sso_connections (lower(email_domain));
create index if not exists sky_sso_connections_org_idx on sky_sso_connections(org_id);
alter table sky_sso_connections enable row level security;  -- deny-all; service role only
