-- 0103_framework_catalogue.sql
-- "Neo adds the framework, not just maps it." When a customer names a framework Neo recognises
-- (e.g. ISO/IEC 27017, CSA CCM, HIPAA Security Rule), Neo now recalls that framework's REAL control
-- catalogue itself and stores it here, so the crosswalk maps to verifiable control IDs instead of
-- guessing from the name — and so a human can review/edit the catalogue Neo worked from. Also holds a
-- catalogue the customer pasted. Empty when Neo doesn't recognise the framework and none was pasted.
alter table org_frameworks add column if not exists catalogue text;

comment on column org_frameworks.catalogue is
  'The framework''s control catalogue (one control per line, "ID — Title") that Neo mapped against: '
  'recalled by Neo for a known standard, or pasted by the customer. Reviewable/editable; never authoritative until mappings are confirmed.';
