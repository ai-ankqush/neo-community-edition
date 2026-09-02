-- 0090_pal_manifest_source.sql
-- Honesty guard for the real-target library.
--
-- Library targets carry a REPRESENTATIVE manifest (compiled from public docs to capture the shape of a
-- server's authority) — good enough to demonstrate the twin attack internally, but not a byte-exact copy of a
-- released version. Publishing "PAL broke <vendor>" against such a manifest would be a claim we can't stand
-- behind. So a target records where its manifest came from, and the publish path refuses to push a
-- representative-manifest finding to the PUBLIC frontier. To publish against a named third party, load that
-- server's EXACT manifest (which sets this to 'verified') and follow responsible disclosure.

alter table pal_targets add column if not exists manifest_source text not null default 'verified';
  -- 'representative' (from the library) | 'verified' (exact manifest supplied by the operator)

comment on column pal_targets.manifest_source is
  'representative = shape compiled from public docs (library seed); verified = exact manifest supplied. Findings on a representative-manifest target cannot be published to the public frontier.';
