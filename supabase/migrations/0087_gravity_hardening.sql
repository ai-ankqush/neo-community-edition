-- 0087_gravity_hardening.sql
-- Neo Gravity — hardening for real (non-demo) use.
--
-- Three defects are closed here, all of which only matter once a real tenant with real concurrency runs
-- through the kernel:
--
--   1. IDEMPOTENCY. A retried act (network timeout, client retry, at-least-once queue) previously ran the
--      intent twice: two decisions, two authorizations, two real side effects. A caller-supplied
--      idempotency key now makes an act exactly-once per tenant — the replay returns the original decision
--      instead of producing a second one.
--
--   2. EVIDENCE GAPS. The ledger append is optimistic (read last seq, insert seq+1) and serialized by the
--      unique (org_id, seq) index. Under concurrency one writer loses the race. That is correct and safe —
--      but the loser used to be swallowed by a console.error, which means evidence could go missing with no
--      trace. In a tamper-EVIDENT ledger a silent gap is the one unacceptable failure. Appends now retry,
--      and a append that still fails is recorded here: the inability to write evidence is itself evidence.
--
--   3. TENANCY. See the application change in decide/authorization.ts — an authorization is now bound to
--      and checked against its org, so a token can never be presented outside the tenant it was issued in.

-- 1 ─────────────────────────────────────────────────────────── exactly-once acts
alter table gravity_decisions add column if not exists idempotency_key text;

comment on column gravity_decisions.idempotency_key is
  'Caller-supplied key (Idempotency-Key header or body field). A repeat of the same key in the same org returns the original decision rather than adjudicating and executing again.';

-- Scoped per tenant: two tenants may independently choose the same key.
create unique index if not exists gravity_decisions_org_idem_idx
  on gravity_decisions (org_id, idempotency_key)
  where idempotency_key is not null;

-- 2 ─────────────────────────────────────────────────────── provable evidence gaps
create table if not exists gravity_evidence_gaps (
  gap_id      uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  event_type  text not null,
  ref_id      text,
  payload     jsonb not null default '{}'::jsonb,   -- what we were unable to record
  reason      text not null,                        -- why the append failed, after retries
  attempts    int  not null default 1,
  created_at  timestamptz not null default now()
);
create index if not exists gravity_evidence_gaps_org_idx on gravity_evidence_gaps (org_id, created_at desc);
alter table gravity_evidence_gaps enable row level security;  -- deny-all; service role only

comment on table gravity_evidence_gaps is
  'Records an evidence-ledger append that could not be completed. The chain itself stays intact and verifiable; this table is the honest account of what is missing from it, so an auditor is never shown a clean chain that quietly lost entries.';

-- 3 ──────────────────────────────────────────────── correct the superseded notes
comment on table gravity_decisions is
  'Append-only decision ledger. Every consequential intent is adjudicated here and the envelope is permanent; execution outcome and recovery are appended, never rewritten. Live executors are bound to this gate — nothing with a side effect runs without an allow and a single-use authorization.';

comment on table gravity_evidence is
  'Hash-linked, append-only tamper-evident ledger. Each entry chains to the previous via prev_hash/entry_hash; any edit or delete breaks the chain and is detectable by verifyChain(). Concurrent appends are serialized by the unique (org_id, seq) index and retried by the writer; an append that still fails is recorded in gravity_evidence_gaps rather than being lost silently.';
