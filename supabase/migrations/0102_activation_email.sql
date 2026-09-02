-- "Activate your account" nudge bookkeeping: set once when we email an org that
-- signed up but never reached the app (last_active_at is null). Sending is one-shot;
-- once the org actually signs in, last_active_at fills and they're no longer eligible.
alter table organizations
  add column if not exists activation_email_sent_at timestamptz;
