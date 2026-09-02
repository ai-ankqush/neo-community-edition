-- 0015: enterprise SSO setup requests + status, per organization.
-- Assisted onboarding: the org admin submits their IdP details here; Neo creates
-- the Clerk enterprise connection in the Clerk Dashboard and flips status to
-- 'active'. Sign-in itself is handled by Clerk once the connection exists.

create table if not exists sso_configs (
  org_id        uuid primary key references organizations(id) on delete cascade,
  status        text not null default 'requested',  -- requested | active | disabled
  idp_type      text,                                -- okta | entra | google | saml | oidc | other
  email_domains text,                                -- e.g. "acme.com, acme.co.uk"
  metadata_url  text,                                -- IdP SAML metadata URL (or note)
  contact_email text,                                -- customer IT contact
  notes         text,
  requested_by  text,                                -- clerk user id
  requested_at  timestamptz not null default now(),
  activated_at  timestamptz
);

-- Accessed only through the service role (server). Deny all by default.
alter table sso_configs enable row level security;
