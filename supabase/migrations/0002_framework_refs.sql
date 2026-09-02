-- 0002: framework crosswalk references on control items
-- Run in Supabase SQL Editor (without RLS / as admin), same as 0001.

alter table control_items
  add column if not exists framework_refs jsonb not null default '{}';

comment on column control_items.framework_refs is
  'Crosswalk refs per framework: {nist_ai_rmf, iso_42001, eu_ai_act, owasp_llm}';
