-- 0076_gravity_evidence.sql
-- Neo Gravity — the tamper-evident evidence ledger (build step 7).
--
-- A hash-linked, append-only record per tenant: every entry carries prev_hash + entry_hash, so any edit or
-- deletion breaks the chain and is detectable. It records the whole decision→authorization→execution→
-- outcome→recovery lifecycle, plus amendments and admin actions. Post-execution outcome/recovery is also
-- appended to the originating decision row (never rewritten).
--
-- NOTE: single-writer-per-org assumption for now (per-org serialization is a later hardening step);
-- the (org_id, seq) unique index detects a race so a colliding append fails rather than forking the chain.

create table if not exists gravity_evidence (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  seq         bigint not null,
  event_type  text not null,              -- decision | authorization_issued | authorization_consumed | execution_outcome | amendment | admin
  ref_id      text,                       -- decision_id / auth_id / amendment_id …
  payload     jsonb not null default '{}'::jsonb,
  prev_hash   text not null,              -- entry_hash of the previous entry (genesis = 64 zeros)
  entry_hash  text not null,              -- sha256 of {org_id, seq, event_type, ref_id, payload, prev_hash}
  created_at  timestamptz not null default now(),
  unique (org_id, seq)
);
create index if not exists gravity_evidence_org_seq_idx on gravity_evidence (org_id, seq desc);
alter table gravity_evidence enable row level security;
comment on table gravity_evidence is
  'Hash-linked, append-only tamper-evident ledger. Each entry chains to the previous via prev_hash/entry_hash; any edit or delete breaks the chain and is detectable by verifyChain(). Never updated or deleted.';
