-- Vendor bug-bounty posture: behavioral security evidence for an AI vendor review.
-- A vendor that runs a bounty exposes real signal — not "do you have a bounty?" but how fast they FIX. Active
-- findings, what they've resolved, and fix frequency become an input to the risk tier, not a questionnaire box.
-- One posture per review. Populated by the reviewer now (from the public program page); auto-synced from the
-- platform API later (Layer 2).

create table if not exists vendor_bounty_posture (
  review_id           uuid primary key references vendor_reviews(id) on delete cascade,
  org_id              uuid not null references organizations(id) on delete cascade,
  runs_bounty         boolean not null default false,
  platform            text,                 -- hackerone | bugcrowd | intigriti | yeswehack | private | other
  program_url         text,
  active_findings     int,                  -- open / unresolved reports
  resolved_count      int,                  -- total resolved
  avg_resolution_days numeric,              -- time-to-fix (the frequency signal)
  avg_response_days   numeric,              -- time-to-first-response
  last_activity       date,                 -- last visible program activity
  ai_in_scope         text,                 -- allowed | excluded | silent | unknown
  notes               text,
  updated_by          text,
  updated_at          timestamptz not null default now()
);

create index if not exists vendor_bounty_posture_org on vendor_bounty_posture(org_id);
alter table vendor_bounty_posture enable row level security;
-- Service-role only + in-code org scoping (matches the rest of the customer data path).
