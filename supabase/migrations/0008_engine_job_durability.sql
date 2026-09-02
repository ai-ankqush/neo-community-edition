-- 0008: engine job durability. Track when a run actually started and how many
-- attempts it has had. A watchdog (/api/cron/reap-jobs) fails any job left in
-- running/queued past the max runtime, so a function timeout can never leave a
-- job hanging as 'running' forever.

alter table engine_jobs add column if not exists started_at timestamptz;
alter table engine_jobs add column if not exists attempts int not null default 0;

-- status now also includes 'queued' (created, awaiting the background worker).
create index if not exists engine_jobs_status_created_idx on engine_jobs (status, created_at);
