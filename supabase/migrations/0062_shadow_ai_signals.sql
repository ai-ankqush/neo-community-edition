-- 0062: Shadow AI Spend Discovery — financial signals of ungoverned AI.
--
-- PRIVACY BY DATA-MINIMIZATION: this table deliberately has NO personal-identity
-- columns (no cardholder name, employee name, or employee email). Attribution is
-- to org structure only (department / cost-center / business unit). Neo cannot
-- display, export, or leak the individual because it never stores them — the
-- "we don't even know" guarantee is enforced at the schema level. Reaching a
-- person is an out-of-tool HR request (a message), never a stored field.
--
-- A signal is NOT a use case. When declared + converted it links to a use_case
-- (use_case_id) and becomes governed corporate IT — only then does it appear on
-- the AI Control Graph. Until then it lives only on the Shadow AI page.

create table if not exists shadow_ai_signals (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,

  -- source + non-personal transaction signal
  source             text not null default 'composer',   -- e.g. ramp / brex / composer recipe id
  vendor             text,                                -- normalized vendor/merchant name
  merchant_descriptor text,                               -- raw billing descriptor
  amount             numeric,
  currency           text default 'USD',
  recurrence         text,                                -- monthly / annual / one-off / recurring
  category           text,                                -- expense category if available

  -- org-structure attribution ONLY (never a person)
  department         text,
  cost_center        text,
  business_unit      text,

  -- classification (qualitative bands, not fake precision)
  classification     text not null default 'Possible AI-related spend',
  confidence_band    text default 'Medium',               -- High / Medium / Low
  ai_category        text,                                -- Model provider / AI assistant / ...
  reason             text,                                -- human-readable evidence explanation
  evidence           jsonb not null default '[]'::jsonb,  -- signals used

  -- lifecycle
  status             text not null default 'new',         -- new / needs_owner / awaiting_declaration / declared / converted / under_review / approved / conditions / vendor_review / blocked / duplicate / false_positive / exception / closed
  use_case_id        uuid references use_cases(id) on delete set null,

  first_seen         timestamptz,
  last_seen          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_shadow_ai_signals_org      on shadow_ai_signals (org_id);
create index if not exists idx_shadow_ai_signals_status    on shadow_ai_signals (org_id, status);
create index if not exists idx_shadow_ai_signals_class     on shadow_ai_signals (org_id, classification);
create index if not exists idx_shadow_ai_signals_vendor    on shadow_ai_signals (org_id, vendor);

comment on table shadow_ai_signals is
  'Shadow AI Spend Discovery signals. No personal-identity columns by design (data-minimization). Attribution to department/cost-center only; a person is reached via an out-of-tool HR request, never stored. A signal becomes a governed use case on conversion.';
