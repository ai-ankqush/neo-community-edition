-- 0016: service-provider details Neo hands back to the customer for their IdP.
-- Posted by super-admin from /admin after creating the Clerk connection; shown
-- to the customer's admin on their SSO page so there's no email round-trip.

alter table sso_configs add column if not exists acs_url            text;  -- Assertion Consumer Service URL (from Clerk)
alter table sso_configs add column if not exists sp_entity_id       text;  -- Service Provider Entity ID / Audience (from Clerk)
alter table sso_configs add column if not exists setup_instructions text;  -- free-text notes/next steps for the customer's IT
