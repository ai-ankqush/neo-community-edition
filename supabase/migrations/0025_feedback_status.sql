-- 0025: track feedback through a lifecycle so Ankush can action it.
-- new | in_progress | done | parked (next release) | wontfix
alter table feedback add column if not exists status text not null default 'new';
create index if not exists feedback_status_idx on feedback (status);
