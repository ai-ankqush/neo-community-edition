-- 0017: living context. Customers can add free-form context at any stage, and
-- edit prior answers. context_updated_at marks when context last changed so
-- downstream stages (and human decisions) can be flagged for re-assessment.

create table if not exists context_entries (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  use_case_id uuid not null references use_cases(id) on delete cascade,
  note        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index on context_entries (org_id, use_case_id, created_at desc);
alter table context_entries enable row level security;

alter table use_cases add column if not exists context_updated_at timestamptz;
