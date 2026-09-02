-- 0081_org_nullable_clerk.sql
-- Sky-native orgs have no Clerk id. Relax the NOT NULL so an organization can be created purely by Sky
-- signup. The UNIQUE constraint still applies to non-null values (Postgres treats NULLs as distinct), so
-- Neo Control's Clerk-backed orgs are unaffected.
alter table organizations alter column clerk_org_id drop not null;
