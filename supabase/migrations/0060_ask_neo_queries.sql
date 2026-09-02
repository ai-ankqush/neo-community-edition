-- Ask Neo query history — per-user recents (don't re-ask) + anonymized org "most asked".
create table if not exists ask_neo_queries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     text not null,
  question    text not null,
  mode        text not null default 'portfolio',
  created_at  timestamptz not null default now()
);
create index if not exists ask_neo_queries_org_time on ask_neo_queries(org_id, created_at desc);
create index if not exists ask_neo_queries_user_time on ask_neo_queries(org_id, user_id, created_at desc);

alter table ask_neo_queries enable row level security;
-- Deny-all to anon/authenticated; the app reaches this only via the service role.
