-- 0032: persist the last preflight result per connection (readiness shown in UI).
alter table org_connections add column if not exists last_preflight     jsonb;
alter table org_connections add column if not exists last_preflight_at   timestamptz;
