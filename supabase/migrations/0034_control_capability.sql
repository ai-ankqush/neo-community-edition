-- 0034: link a control to a verification capability so it can be checked live.
alter table control_items add column if not exists capability_id text;
create index if not exists control_items_capability_idx on control_items (org_id, use_case_id, capability_id);
