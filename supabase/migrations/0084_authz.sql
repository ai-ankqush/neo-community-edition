-- 0084_authz.sql
-- Authorization layer. Authentication answered "who are you"; this answers "what may you do".
-- (Gravity's gate remains a separate, later question: "may this action actually happen".)
--
-- Design goals: one model covers HUMANS and MACHINES (both resolve to the same neutral Principal), and
-- tenants can define their own roles so new capabilities don't require schema changes. Grants are
-- permission strings ("overlay:author") and may use wildcards ("overlay:*", "*").

-- Tenant-defined roles. System roles live in code; these extend them per organization.
create table if not exists sky_roles (
  role_id     uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  key         text not null,                       -- unique within the org, e.g. 'model-reviewer'
  name        text not null,
  description text,
  grants      jsonb not null default '[]'::jsonb,  -- ["usecase:read","overlay:author"]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists sky_roles_org_key_idx on sky_roles(org_id, lower(key));
alter table sky_roles enable row level security;  -- deny-all; service role only

-- Who holds which role. A principal is a human user OR a machine credential — same table, same model.
create table if not exists sky_role_assignments (
  assignment_id  uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  principal_type text not null check (principal_type in ('user', 'service_key')),
  principal_id   uuid not null,                    -- sky_users.user_id or sky_service_keys.key_id
  role_key       text not null,                    -- system role key or sky_roles.key
  scope          jsonb,                            -- reserved: future resource-scoped grants
  granted_by     uuid references sky_users(user_id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index if not exists sky_role_assignments_unique_idx
  on sky_role_assignments(org_id, principal_type, principal_id, role_key);
create index if not exists sky_role_assignments_principal_idx on sky_role_assignments(principal_type, principal_id);
alter table sky_role_assignments enable row level security;  -- deny-all; service role only

-- Enterprise SSO actually granting access: map an IdP group/claim value onto a Neo role.
create table if not exists sky_sso_role_mappings (
  mapping_id    uuid primary key default gen_random_uuid(),
  connection_id uuid not null references sky_sso_connections(connection_id) on delete cascade,
  claim_value   text not null,                     -- e.g. 'neo-admins' from the groups claim
  role_key      text not null,
  created_at    timestamptz not null default now()
);
create unique index if not exists sky_sso_role_mappings_unique_idx on sky_sso_role_mappings(connection_id, lower(claim_value));
alter table sky_sso_role_mappings enable row level security;  -- deny-all; service role only

-- Which claim carries groups, and what a user gets when no mapping matches.
alter table sky_sso_connections add column if not exists groups_claim text;
alter table sky_sso_connections add column if not exists default_role_key text not null default 'viewer';
