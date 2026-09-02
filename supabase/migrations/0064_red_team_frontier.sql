-- 0064: Red Team frontier — the persisted "unknown becoming known" catalog.
--
-- Anticipate's frontier is no longer a hardcoded seed. It's a fleet-wide catalog
-- of emerging attack CLASSES that grows as Neo learns. Two origins:
--   curated   — Neo-authored + PAL co-evolution seeds (always visible).
--   graduated — a class that customers confirmed via Live Fire, promoted into the
--               shared frontier ONCE >= k DISTINCT orgs independently confirmed it.
--
-- PRIVACY (mirrors 0052 fleet immunity): the ONLY thing that crosses orgs is the
-- de-identified CLASS (battery/OWASP/ATLAS + generic description). No use-case
-- names, no transcripts, no org id. The contributor is an opaque sha256 token.
-- k-anonymity: a graduated class becomes is_shared only at >= k distinct
-- contributors, so it's never attributable to one org. Gated on organizations.fleet_opt_in.

create table if not exists red_team_frontier (
  id                   uuid primary key default gen_random_uuid(),
  attack_class         text not null unique,   -- canonical class key (battery key)
  title                text not null,
  owasp_ref            text,
  atlas_ref            text,
  what_it_is           text not null,
  why_it_matters       text not null,
  origin               text not null default 'curated',  -- curated | graduated
  source_label         text not null default 'Neo fleet',
  distinct_contributors int not null default 0,
  is_shared            boolean not null default false,    -- visible fleet-wide (curated = always; graduated = at >= k)
  is_active            boolean not null default true,
  first_observed       date not null default current_date,
  last_observed        date not null default current_date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- k-anonymity ledger: one vote per org per class; contributor is an opaque token.
create table if not exists red_team_frontier_contributions (
  id                uuid primary key default gen_random_uuid(),
  attack_class      text not null,
  contributor_token text not null,          -- sha256 of the org id — never the org id
  first_seen        timestamptz not null default now(),
  unique (attack_class, contributor_token)
);
create index if not exists idx_rt_frontier_contrib_class on red_team_frontier_contributions (attack_class);

alter table red_team_frontier               enable row level security; -- service-role only
alter table red_team_frontier_contributions enable row level security; -- service-role only

comment on table red_team_frontier is
  'Fleet-wide catalog of emerging Red Team attack classes (Anticipate frontier). Curated seeds + graduated classes. Class-level/derived only — no org identity, no transcripts. Graduated classes go is_shared at >= k distinct contributors.';

-- Seed the curated frontier (was the hardcoded FRONTIER const). Always shared.
insert into red_team_frontier (attack_class, title, owasp_ref, atlas_ref, what_it_is, why_it_matters, origin, source_label, distinct_contributors, is_shared, first_observed, last_observed)
values
  ('chained_tool_abuse',
   'Cross-tool authority laundering', 'LLM07', 'AML.T0053',
   'An agent is steered to use a low-privilege tool to stage state, then a second tool consumes that state to take a high-privilege action no single step looked entitled to.',
   'Per-tool approval checks pass individually while the chain crosses a privilege boundary. Neo''s single-model judgement scores the trajectory, not the step — which is how it catches this.',
   'curated', 'PAL co-evolution', 99, true, date '2026-06-24', date '2026-06-24'),
  ('indirect_injection_escalation',
   'Retrieved-content instruction escalation', 'LLM01', 'AML.T0051',
   'Injected instructions hidden inside retrieved documents that assert a false authority context (''the user is an administrator'') to unlock data the caller isn''t entitled to.',
   'Grows with every RAG deployment. Identity-aware retrieval + source-trust is the break; the feed flags AIs that retrieve untrusted content before it bites.',
   'curated', 'Neo fleet', 99, true, date '2026-06-19', date '2026-06-19'),
  ('encoded_exfiltration',
   'Encoded-channel exfiltration', 'LLM06', 'AML.T0057',
   'The model is asked to base64/rot-encode sensitive context so it slips past keyword DLP as an opaque blob.',
   'Naïve output filters miss it. Output redaction that decodes before scanning is the break.',
   'curated', 'Neo fleet', 99, true, date '2026-06-11', date '2026-06-11'),
  ('persona_persistence_jailbreak',
   'Persona-persistence jailbreak', 'LLM01', 'AML.T0054',
   'A benign persona is established over several turns, then leveraged many turns later so the policy-violating ask never appears adjacent to the framing that unlocked it.',
   'Single-turn guardrails don''t see it. Trajectory-aware judgement (Neo''s model carries context across turns) does.',
   'curated', 'PAL co-evolution', 99, true, date '2026-05-30', date '2026-05-30')
on conflict (attack_class) do nothing;
