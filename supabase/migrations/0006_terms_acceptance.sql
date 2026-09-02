-- 0006: legal consent record. Clerk's sign-up form captures the consent
-- checkbox; we mirror it here as a versioned, auditable record so we can
-- prove which user accepted which version of the Terms/Privacy and when.

create table terms_acceptances (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,                 -- clerk user id
  org_id          uuid references organizations(id) on delete cascade,
  terms_version   text not null,
  privacy_version text not null,
  accepted_at     timestamptz not null default now(),
  source          text,                          -- 'signup' | 'gate'
  created_at      timestamptz not null default now(),
  unique (user_id, terms_version)
);

create index on terms_acceptances (org_id);
alter table terms_acceptances enable row level security;
