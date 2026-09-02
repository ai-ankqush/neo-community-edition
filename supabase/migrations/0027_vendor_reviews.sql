-- 0027: Vendor AI Review — pre-purchase assessment of third-party AI products.
-- Lives outside use_cases (its own menu + tables). One-shot classify/tier, a
-- tier-scaled vendor question pack, scoped vendor participants who answer via an
-- invite, per-answer scoring, and a buying decision. Enterprise + Reviewer plans.

create table if not exists vendor_reviews (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  product_name        text not null,
  vendor_name         text,
  category            text,                       -- e.g. support copilot, dev tool, HR
  business_owner_name text,
  business_owner_email text,
  description         text,                        -- what it does (lookup-prefilled)
  ai_features         text,
  planned_data_access text,
  deployment          text,                        -- saas | self-hosted | hybrid
  status              text not null default 'intake',
                      -- intake | evaluated | sent | in_review | reassessed | decided | archived
  tier                int,
  classification      jsonb,                       -- SEE/DECIDE/DO, pattern, autonomy
  decision            text,                        -- approve | conditions | defer | reject
  decision_rationale  text,
  conditions          jsonb,                       -- [{text, stage, owner}]
  residual_risk       text,
  created_by          text,                        -- clerk user id
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on vendor_reviews (org_id, status);
alter table vendor_reviews enable row level security;

create table if not exists vendor_review_items (
  id                uuid primary key default gen_random_uuid(),
  review_id         uuid not null references vendor_reviews(id) on delete cascade,
  org_id            uuid not null references organizations(id) on delete cascade,
  section           text not null,                 -- A..J
  q_ref             text,                          -- e.g. Q21
  question          text not null,
  why_it_matters    text,
  required_evidence text,
  acceptable_answer text,
  concern_answer    text,
  suggested_condition text,
  is_critical       boolean not null default false,
  vendor_answer     text,
  evidence_url      text,
  answer_source     text,                          -- vendor | customer
  status            text not null default 'pending',
                    -- pending | met | partial | gap | unanswered | evasive
  sort              int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on vendor_review_items (org_id, review_id);
alter table vendor_review_items enable row level security;

-- Per-review scoped vendor identity. A participant is NOT an org member and has
-- no org RBAC; their access is bound to this single review (the "vendor" role).
create table if not exists vendor_review_participants (
  id            uuid primary key default gen_random_uuid(),
  review_id     uuid not null references vendor_reviews(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  email         text not null,
  user_id       text,                              -- clerk id once accepted
  role          text not null default 'vendor',
  invite_token  text not null unique,
  status        text not null default 'invited',   -- invited | active | submitted | revoked
  invited_by    text,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  submitted_at  timestamptz
);
create index on vendor_review_participants (review_id);
create index on vendor_review_participants (invite_token);
alter table vendor_review_participants enable row level security;
