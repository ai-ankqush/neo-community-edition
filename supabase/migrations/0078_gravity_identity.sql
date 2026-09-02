-- 0078_gravity_identity.sql
-- Neo Gravity — neutral identity seam + bring-your-own IdP.
--
-- Gravity must not depend on any one identity provider. Its tenant identity is the neutral internal
-- organizations.id (a UUID), never a Clerk org id. Two tables make identity pluggable:
--
--   gravity_tenant_identities — maps ANY IdP's tenant handle -> the neutral org uuid.
--     Clerk is just one binding: (idp='clerk', external_tenant_id=<clerk_org_id>). A customer's own
--     OIDC issuer is another. Gravity resolves whoever authenticated down to the same neutral tenant.
--
--   gravity_idp_configs — a tenant registers its OWN OpenID Connect issuer here (BYO-IdP). Inbound
--     bearer tokens are verified against the issuer's JWKS; claims are mapped to neutral
--     subject / tenant / roles. Sky (or any IdP) rules authn/z — Gravity only trusts a verified
--     principal and gives it the isolation it needs.
--
-- Additive and safe: Neo Control keeps using Clerk unchanged; organizations.clerk_org_id stays.

-- ANY-IdP tenant binding -> neutral org uuid.
create table if not exists gravity_tenant_identities (
  idp                text not null,               -- 'clerk' | 'oidc' | future providers
  external_tenant_id text not null,               -- the IdP's own tenant/org handle
  org_id             uuid not null references organizations(id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (idp, external_tenant_id)
);
create index if not exists gravity_tenant_identities_org_idx on gravity_tenant_identities(org_id);
alter table gravity_tenant_identities enable row level security;  -- deny-all; service role only

-- A tenant's own OIDC issuer registration (bring-your-own IdP).
create table if not exists gravity_idp_configs (
  issuer         text primary key,                -- token 'iss' — the lookup key for inbound tokens
  org_id         uuid not null references organizations(id) on delete cascade,
  jwks_url       text not null,                   -- where to fetch the signing keys
  audience       text,                            -- expected 'aud' (optional but recommended)
  tenant_claim   text,                            -- optional: claim carrying a tenant handle for multi-tenant IdPs
  subject_claim  text not null default 'sub',     -- claim -> neutral subject id
  roles_claim    text,                            -- optional claim carrying roles (string or array)
  role_map       jsonb not null default '{}'::jsonb, -- { "<idp role>": "org_admin|assessor|contributor|viewer" }
  default_role   text not null default 'viewer',
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists gravity_idp_configs_org_idx on gravity_idp_configs(org_id);
alter table gravity_idp_configs enable row level security;  -- deny-all; service role only
