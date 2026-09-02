-- 0033: first-run onboarding state, per user per org.
create table if not exists user_onboarding (
  user_id                text not null,
  org_id                 uuid not null references organizations(id) on delete cascade,
  role                   text,        -- self-declared role from the concierge
  concern                text,        -- the AI system they named
  welcomed_at            timestamptz, -- completed/skipped the concierge
  checklist_dismissed_at timestamptz,
  created_at             timestamptz not null default now(),
  primary key (user_id, org_id)
);
alter table user_onboarding enable row level security;
