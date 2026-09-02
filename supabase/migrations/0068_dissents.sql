-- 0068_dissents.sql
-- DISSENT — Neo forms its own view and disagrees with the human when the human's call
-- contradicts a fact Neo can point at. It never blocks: the human owns the judgement and
-- can overrule, but the disagreement (and the overrule reason) is RECORDED. That record is
-- the governance artifact: "the AI flagged this, the human overruled it, here's why."
--
-- Every dissent is also a falsifiable PREDICTION, so `resolution` seeds the calibration
-- scorecard later (was Neo right?). Dissent is the claim; the scorecard is the track record.

create table if not exists dissents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  use_case_id   uuid references use_cases(id) on delete cascade,
  rule          text not null,          -- attested_but_exposed | tier_vs_capability | approved_with_open_critical
  claim         text not null,          -- Neo's position, one line
  reason        text not null,          -- why, in plain language, grounded in the evidence
  falsifier     text not null,          -- "what would change my mind" — conviction must be falsifiable
  evidence      jsonb not null default '{}'::jsonb,  -- pointers: finding id, control, action classes
  severity      text not null default 'medium',      -- critical | high | medium
  confidence    numeric not null default 0.7,        -- how sure Neo is (evidence quality)
  status        text not null default 'open',        -- open | accepted | overruled | stale
  human_reason  text,                   -- REQUIRED on overrule — the accountability capture
  responded_by  text,
  responded_at  timestamptz,
  resolution    text,                   -- neo_right | neo_wrong | null (feeds the scorecard)
  resolved_at   timestamptz,
  fingerprint   text not null,          -- dedupe: never raise the same disagreement twice
  created_at    timestamptz not null default now(),
  unique (org_id, fingerprint)
);
create index if not exists dissents_org_status_idx on dissents (org_id, status, created_at desc);
create index if not exists dissents_uc_idx on dissents (use_case_id, status);

alter table dissents enable row level security;  -- server-only (service role), like the rest
