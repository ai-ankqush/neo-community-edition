-- Per-org entitlement overrides + suspend switch (super-admin control plane).
-- entitlement_overrides: jsonb of Partial<PlanDef> keys that override the plan default for this org.
-- suspended: hard on/off switch, checked at feature gates (independent of soft-delete).
alter table organizations
  add column if not exists entitlement_overrides jsonb not null default '{}'::jsonb,
  add column if not exists suspended boolean not null default false;
