-- 0044: org-level / multi-account connection hierarchy.
-- Enterprises run many AWS accounts / GCP projects / Azure subscriptions. Connect ONCE at the org
-- level and inherit downward: an org connection enumerates child accounts and runs read-only checks
-- per child, rolling evidence up to each control objective. Adds the shape to support that without
-- breaking single-account connections (defaults keep existing rows as 'account' scope).

alter table org_connections
  add column if not exists scope_level text not null default 'account',   -- 'account' | 'org'
  add column if not exists parent_connection_id uuid references org_connections(id) on delete cascade,
  add column if not exists external_id text,                              -- AWS AssumeRole external id (promoted from credential for org reuse)
  add column if not exists mode text not null default 'enhanced',         -- 'basic' | 'enhanced' (AWS SecurityAudit vs +supplemental)
  add column if not exists account_ref text;                              -- the specific account/project/subscription this row verifies (null for the org parent)

create index if not exists org_connections_parent_idx on org_connections (parent_connection_id);

-- control_evidence: which cloud account/project/subscription produced this evidence, so an
-- org-level verify can record per-account results and roll them up to the control.
alter table control_evidence
  add column if not exists account_ref text;

create index if not exists control_evidence_account_idx on control_evidence (org_id, account_ref);

-- Notes:
--  * scope_level='account' (default) = today's single-account behaviour, untouched.
--  * scope_level='org' = a parent row holding the management-account role; child rows
--    (parent_connection_id set, account_ref = member account id) are created on enumeration.
--  * external_id is the shared secret in the AssumeRole trust policy; it is not a credential on its
--    own (it only works paired with Neo's account in the role's trust policy) but is treated as
--    sensitive and never logged.
