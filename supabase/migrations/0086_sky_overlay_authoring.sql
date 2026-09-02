-- 0086_sky_overlay_authoring.sql
-- Neo Sky's first real capability: authoring the tenant overlay.
--
-- This is the product promise made concrete — a customer bends the rules to their enterprise, and the
-- compiler guarantees they cannot break them. Drafts are safe to iterate on; publishing compiles a new
-- immutable effective constitution and is recorded in the tamper-evident ledger as an amendment.

-- One working draft per tenant. Never governs anything until published.
create table if not exists sky_overlay_drafts (
  org_id     uuid primary key references organizations(id) on delete cascade,
  body       jsonb not null default '{}'::jsonb,
  note       text,
  updated_by uuid references sky_users(user_id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table sky_overlay_drafts enable row level security;  -- deny-all; service role only

-- Immutable publication history: what was published, by whom, and which effective law it produced.
-- Gives the tenant an audit trail and a basis for rollback.
create table if not exists gravity_overlay_versions (
  version_id     uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  version        int not null,
  body           jsonb not null,
  effective_hash text not null,
  base_version   int not null,
  note           text,
  published_by   uuid references sky_users(user_id) on delete set null,
  published_at   timestamptz not null default now()
);
create unique index if not exists gravity_overlay_versions_unique_idx on gravity_overlay_versions(org_id, version);
create index if not exists gravity_overlay_versions_org_idx on gravity_overlay_versions(org_id, published_at desc);
alter table gravity_overlay_versions enable row level security;  -- deny-all; service role only
