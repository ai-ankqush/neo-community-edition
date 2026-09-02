-- 0075_gravity_decision_gate.sql
-- Neo Gravity — the decision-to-execution contract (build steps 4–6).
--
-- Every consequential intent (build OR run) passes ONE gate that returns allow / require / deny with a
-- recorded reason, a constitution hash, and a reversibility class. On ALLOW the gate issues a short-lived,
-- scoped, single-use EXECUTION AUTHORIZATION; an executor is technically unable to act without presenting a
-- valid, matching, unconsumed authorization. Decision, authorization, execution, and outcome are distinct.
--
-- NOTE: foundation only — not yet wired into the live executors. The gate + authorization mechanism exist;
-- binding real connectors/adapters to require an authorization is a later step.

-- Append-only decision ledger (the decision envelope). Post-execution fields are appended, never rewritten.
create table if not exists gravity_decisions (
  decision_id          uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  actor                text,
  intent_type          text not null,            -- build | run
  resource             text not null,
  action               text not null,
  parameter_digest     text not null,
  constitution_version int not null,
  constitution_hash    text not null,
  decision             text not null,            -- allow | require | deny
  reason_code          text not null,
  human_explanation    text,
  unmet_obligations    jsonb not null default '[]'::jsonb,
  reversibility_class  text not null,            -- reversible | compensatable | irreversible | unknown
  compensation_reference text,
  required_approvers   jsonb not null default '[]'::jsonb,
  expires_at           timestamptz,
  correlation_id       text,
  -- appended after execution (later steps):
  execution_outcome    text,
  state_change         jsonb,
  evidence_references  jsonb,
  recovery_status      text,
  created_at           timestamptz not null default now()
);
create index if not exists gravity_decisions_org_idx on gravity_decisions (org_id, created_at desc);
create index if not exists gravity_decisions_corr_idx on gravity_decisions (correlation_id);
alter table gravity_decisions enable row level security;

-- Issued execution authorizations. Single-use, time-bound, bound to the exact intent + constitution hash.
create table if not exists gravity_authorizations (
  auth_id             uuid primary key default gen_random_uuid(),
  decision_id         uuid not null references gravity_decisions(decision_id) on delete cascade,
  org_id              uuid not null references organizations(id) on delete cascade,
  actor               text,
  resource            text not null,
  action              text not null,
  parameter_digest    text not null,
  constitution_hash   text not null,
  reversibility_class text not null,
  idempotency_key     text not null unique,
  secret_hash         text not null,            -- sha256 of the token secret; the secret itself is never stored
  expires_at          timestamptz not null,
  status              text not null default 'issued',   -- issued | consumed | expired | revoked
  consumed_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists gravity_auth_org_status_idx on gravity_authorizations (org_id, status);
create index if not exists gravity_auth_decision_idx on gravity_authorizations (decision_id);
alter table gravity_authorizations enable row level security;
comment on table gravity_authorizations is
  'Scoped single-use execution authorizations issued by the Gravity gate on ALLOW. An executor must present a valid, matching, unconsumed token; consumption is atomic (status issued->consumed).';
