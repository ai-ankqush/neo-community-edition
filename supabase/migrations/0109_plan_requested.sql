-- 0109: plan_requested was referenced throughout the code (admin roster, plans page, tier-trial flow,
-- founding, billing webhook) but never had a migration — it was added ad-hoc to the original US DB only.
-- Any DB built purely from migrations (e.g. a white-label partner's) lacks it, so those queries error
-- and admin plan management "shows nothing" / silently fails. Define it idempotently everywhere.
alter table organizations
  add column if not exists plan_requested text;
