-- 0003: background engine jobs (run in Supabase SQL Editor, same as before)

create table engine_jobs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  use_case_id   uuid references use_cases(id) on delete cascade,
  use_case_name text,
  stage         text not null,
  status        text not null default 'running',  -- running | done | failed
  draft         jsonb,
  error         text,
  model         text,
  created_by    text not null,
  read          boolean not null default false,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index on engine_jobs (org_id, created_at desc);
create index on engine_jobs (org_id, read) where read = false;

alter table engine_jobs enable row level security;
