-- 0110: per-deployment email template overrides.
-- A partner-admin can toggle each lifecycle email on/off and override its subject/body. NULL subject
-- or body means "use the built-in default". One row per email key; deployment-wide (not per-org).
create table if not exists email_templates (
  key        text primary key,   -- welcome | trial_ending | activate | inactivity_nudge | dormancy_warning | vendor_invite
  enabled    boolean not null default true,
  subject    text,               -- null = built-in default
  body       text,               -- null = built-in default (plain text; {vars} substituted, wrapped in the brand shell)
  updated_at timestamptz not null default now(),
  updated_by text
);
