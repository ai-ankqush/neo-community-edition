-- 0094_pal_finding_source.sql
-- Where a finding came from: an authored rule, or the model's own search.
--
-- 'generator' = a human wrote a pattern the model then judged (Level A). 'hunt' = the trained PAL net searched
-- the target's real tool combinations and flagged this composition itself, with no rule proposing it (Level B)
-- — the honest basis for "the model discovered this".

alter table pal_findings add column if not exists source text not null default 'generator';

comment on column pal_findings.source is
  'generator = proposed by an authored pattern, judged by the model; hunt = discovered by the model''s own search over the real tool combinations (no rule proposed it).';
