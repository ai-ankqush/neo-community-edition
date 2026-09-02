-- 0054_governance_spine.sql
-- AI Control Graph — the governance spine (Wave 1 #1). The system-of-record
-- fields and entities the graph reads from. Owner/business_function and
-- board_decisions already exist and are reused.

-- use_cases: the missing governance fields
alter table use_cases
  add column if not exists technical_owner text,
  add column if not exists sponsor         text,
  add column if not exists lifecycle       text;  -- proposed | pilot | production | retired

-- accepted/waived risks (distinct from approval `conditions`)
create table if not exists use_case_exceptions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  title        text not null,
  detail       text,
  risk_owner   text,
  status       text not null default 'open',   -- open | closed
  expires_on   date,
  created_at   timestamptz not null default now(),
  created_by   text
);
create index if not exists uc_exceptions_uc on use_case_exceptions (org_id, use_case_id, status);
alter table use_case_exceptions enable row level security;

-- incidents involving an AI use case
create table if not exists use_case_incidents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  use_case_id  uuid not null references use_cases(id) on delete cascade,
  title        text not null,
  severity     text not null default 'medium', -- low | medium | high | critical
  status       text not null default 'open',   -- open | investigating | resolved
  note         text,
  occurred_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text
);
create index if not exists uc_incidents_uc on use_case_incidents (org_id, use_case_id, status);
alter table use_case_incidents enable row level security;
