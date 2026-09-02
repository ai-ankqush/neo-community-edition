-- Neo Sentinel — "Neo runs on Neo" self-protection.
-- The membrane pointed inward: behavioural events about actors ON the Neo app,
-- scored for hostility, used to nudge the actor and alert the SOC.
create table if not exists sentinel_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     text not null,
  kind        text not null,   -- rls_probe | enumeration | prompt_injection | mass_export | privilege_probe | finding | nudge
  severity    text not null,   -- info | low | medium | high
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists sentinel_events_org_user_time on sentinel_events(org_id, user_id, created_at desc);

alter table sentinel_events enable row level security;
-- Deny-all to anon/authenticated; the app reaches this only via the service role.
