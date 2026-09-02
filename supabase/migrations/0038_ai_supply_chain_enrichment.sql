-- 0038_ai_supply_chain_enrichment.sql
-- AI Supply Chain Control (Build 2). Public-registry enrichment cache.
--
-- For "discoverable" dependencies we can enrich provenance from public sources:
--   * HuggingFace  → model author, license, gated/private, downloads, last-modified
--   * OSV.dev      → known CVEs for an open-source library
-- These lookups are about a PUBLIC artifact (the same for every org), so the
-- cache is global and keyed by (source, ref). A TTL (valid_until) keeps it fresh
-- without hammering the upstream APIs. Service-role only (RLS on, no policies).

create table if not exists ai_dependency_enrichment (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,                 -- huggingface | osv
  ref         text not null,                 -- normalized lookup key (model id / library name)
  status      text not null,                 -- ok | not_found | error
  payload     jsonb,                         -- normalized result (license, author, cves, ...)
  fetched_at  timestamptz not null default now(),
  valid_until timestamptz                    -- freshness; null = no auto-expiry
);

create unique index if not exists ai_dep_enrichment_key
  on ai_dependency_enrichment (source, ref);

alter table ai_dependency_enrichment enable row level security;
