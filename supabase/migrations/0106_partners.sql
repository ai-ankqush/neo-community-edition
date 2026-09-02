-- MSP partner registry (lives in the neocontrol/platform-owner DB only).
-- Central control plane for white-label partners. Each partner
-- deployment identifies with `key` and polls /api/partners/status to learn if it's been locked.
create table if not exists partners (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,          -- partner deployment's PARTNER_KEY
  name        text not null,                 -- e.g. "Acme Security"
  domain      text,                          -- e.g. partner.example.com
  locked      boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
