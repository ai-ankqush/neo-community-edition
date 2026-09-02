-- 0074_gravity_kernel.sql
-- Neo Gravity — the trust-kernel foundation (build steps 1–3 + the Avatar verification path, 3b).
--
-- Constitution-as-data: a system-owned Base Constitution + a constrained Tenant Overlay compile into an
-- immutable, hashed Effective Constitution Snapshot that the runtime, the ledger, and the Constitution
-- Explorer all read (the SAME snapshot). The Avatar — the founder-held cryptographic amendment authority —
-- publishes new base versions as SIGNED amendment packages ("descents") recorded in an append-only ledger;
-- the runtime holds only pinned PUBLIC verification keys, never a private key.
--
-- NOTE: this lays the fixed foundation only. It is NOT yet wired into the live decision/execution path.

-- System-owned versioned base law. Seeded from code (BASE_CONSTITUTION_V1) on first read.
create table if not exists gravity_base_constitution (
  version    int primary key,
  hash       text not null,
  body       jsonb not null,
  notes      text,
  created_at timestamptz not null default now()
);
alter table gravity_base_constitution enable row level security;

-- Pinned Avatar public verification keys. The private key never lives here.
create table if not exists gravity_avatar_keys (
  kid            text primary key,
  public_key_pem text not null,
  algo           text not null default 'ed25519',
  status         text not null default 'active',   -- active | revoked
  created_at     timestamptz not null default now()
);
alter table gravity_avatar_keys enable row level security;

-- Append-only Avatar amendment ledger. Each row is a signed constitutional descent (base vN -> vN+1).
create table if not exists gravity_amendments (
  amendment_id          uuid primary key default gen_random_uuid(),
  previous_version      int not null,
  previous_hash         text not null,
  new_version           int not null,
  new_hash              text not null,
  amendment_type        text not null,
  affected_invariants   jsonb,
  human_readable_reason text not null,
  machine_readable_diff jsonb,
  security_impact       text,
  customer_impact       text,
  effective_at          timestamptz,
  expires_at            timestamptz,
  rollback_version      int,
  migration_plan        text,
  signer_kid            text not null,
  founder_signature     text not null,
  signature_fingerprint text,
  created_at            timestamptz not null default now()
);
create index if not exists gravity_amendments_ver_idx on gravity_amendments (new_version);
alter table gravity_amendments enable row level security;
comment on table gravity_amendments is
  'Append-only Avatar amendment ledger. Each row is a signed constitutional descent (base vN -> vN+1). Never updated or deleted.';

-- Per-tenant overlay. Constrained; empty in Gravity, authored in Sky. Can never weaken invariants/safety floor.
create table if not exists gravity_tenant_overlay (
  org_id     uuid primary key references organizations(id) on delete cascade,
  version    int not null default 1,
  body       jsonb not null default '{}'::jsonb,
  status     text not null default 'active',
  updated_at timestamptz not null default now()
);
alter table gravity_tenant_overlay enable row level security;

-- Immutable compiled snapshot (base + overlay) a tenant is governed by. One active per tenant.
create table if not exists gravity_effective_constitution (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  base_version    int not null,
  overlay_version int not null default 0,
  effective_hash  text not null,
  body            jsonb not null,
  active          boolean not null default true,
  compiled_at     timestamptz not null default now()
);
create unique index if not exists gravity_effective_active_uniq
  on gravity_effective_constitution (org_id) where active;
create index if not exists gravity_effective_org_idx on gravity_effective_constitution (org_id);
alter table gravity_effective_constitution enable row level security;
comment on table gravity_effective_constitution is
  'Immutable compiled snapshot (base + overlay) a tenant is governed by. Referenced by every decision; runtime, ledger, and Constitution Explorer all read the SAME active snapshot.';
