-- Public Founding Reviewer leads captured from the marketing site (neocontrol.ai/founding).
-- Distinct from founding_applications (which is org-bound and approving comps the org):
-- a lead has NO account yet, so it can't be comped directly — the admin reviews it,
-- reaches out, and the person signs up before being granted the plan.

create table if not exists founding_leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  company text,
  role text,
  reason text,
  source text not null default 'website',
  status text not null default 'new',  -- new | contacted | closed
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text
);

create index if not exists founding_leads_status_idx
  on founding_leads (status, created_at desc);

-- service-role only (the app uses supabaseAdmin). RLS on with no policies denies all
-- anon/authenticated access, consistent with the rest of the schema. The public
-- intake endpoint inserts via the service role, never the anon key.
alter table founding_leads enable row level security;
