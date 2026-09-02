-- 0035: manual evidence attachment (a link to the artifact) for controls + tests.
alter table control_items   add column if not exists evidence_url text;
alter table assurance_tests add column if not exists evidence_url text;
