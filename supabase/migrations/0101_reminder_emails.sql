-- Reminder-email bookkeeping so nudges never double-send.
-- trial_reminder_sent_at: set once when we email that a trial is ending.
-- nudge_sent_at: set when we send an inactivity nudge; the cron re-arms it
--   automatically once last_active_at moves past it (i.e. the user came back),
--   so no explicit reset is needed.
alter table organizations
  add column if not exists trial_reminder_sent_at timestamptz,
  add column if not exists nudge_sent_at timestamptz;
