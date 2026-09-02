-- 0004: executable implementation detail on control items
-- (paste contents into Supabase SQL Editor and Run)

alter table control_items
  add column if not exists stack_implementation text,
  add column if not exists evidence text,
  add column if not exists assurance_test text;
