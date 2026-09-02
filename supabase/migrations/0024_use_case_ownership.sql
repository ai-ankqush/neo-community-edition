-- 0024: use-case ownership & business function (accountability, Pillar 7).
-- The creator stays the assessor (created_by). Owner is the person/team that
-- actually owns the AI use case — may differ from the assessor and may not have
-- a platform login (free-text name + optional email; can be a team name).

alter table use_cases add column if not exists business_function text;
alter table use_cases add column if not exists owner_name text;
alter table use_cases add column if not exists owner_email text;
