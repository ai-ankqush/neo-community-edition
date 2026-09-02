-- 0065_website_chats.sql
-- Public "Ask Neo" concierge on the marketing site (neocontrol.ai).
-- Each visitor conversation is logged here so the super-admin can review the
-- chatter in /admin. When a visitor volunteers contact details, the endpoint
-- also drops a row into founding_leads (source = 'ask-neo') and links it here.
-- No auth, no org — these are anonymous website visitors.

create table if not exists website_chats (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null unique,          -- client-generated per browser session
  transcript    jsonb not null default '[]'::jsonb,  -- [{ role, content, at }]
  turns         int  not null default 0,
  captured_name    text,
  captured_email   text,
  captured_company text,
  captured_intent  text,                        -- short model-summarised buying intent
  lead_id       uuid references founding_leads(id) on delete set null,
  ip_hash       text,                           -- sha256(ip + salt) — never the raw IP
  user_agent    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists website_chats_created_idx on website_chats (created_at desc);
create index if not exists website_chats_email_idx   on website_chats (captured_email);
create index if not exists website_chats_iphash_idx  on website_chats (ip_hash, created_at desc);

-- Server-only table (service role). No RLS policies for anon/authenticated.
alter table website_chats enable row level security;
