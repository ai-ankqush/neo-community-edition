-- PAL bug-bounty programs: a Lane B target's legal source of truth.
-- A program is imported from a platform (HackerOne / Bugcrowd / Intigriti / YesWeHack), runs a due-diligence
-- gate, and only a CLEARED program may back a bug_bounty authorization. Optionally links to a vendor review so
-- a vendor's own bounty becomes live evidence in an AI risk assessment.

create table if not exists pal_bounty_programs (
  program_id        uuid primary key default gen_random_uuid(),
  org_id            uuid,                                   -- null = Neo-internal (admin reputation lane); set = a customer's review
  platform          text not null,                          -- hackerone | bugcrowd | intigriti | yeswehack
  handle            text not null,                          -- program slug/handle
  name              text not null,
  program_url       text,
  policy_url        text,
  safe_harbor_url   text,
  scope             jsonb not null default '{}'::jsonb,      -- { inScope:[{asset,type}], outOfScope:[...], notes }
  dd_status         text not null default 'pending',         -- pending | cleared | blocked
  dd_checklist      jsonb not null default '[]'::jsonb,      -- [{ key,label,status,detail }]
  vendor_review_id  uuid,                                    -- optional: ties a vendor's bounty into its AI risk review
  connection_id     uuid,                                    -- optional: org_connections row once API sync is wired
  imported_by       text,
  created_at        timestamptz not null default now()
);

create index if not exists pal_bounty_programs_org on pal_bounty_programs(org_id);
create index if not exists pal_bounty_programs_review on pal_bounty_programs(vendor_review_id);

alter table pal_bounty_programs enable row level security;
-- Service-role only (matches the rest of the PAL surface); no permissive policies.

-- Trace a target back to the program (and its authorization) that legally covers it.
alter table pal_targets add column if not exists bounty_program_id uuid;
create index if not exists pal_targets_bounty_program on pal_targets(bounty_program_id);
