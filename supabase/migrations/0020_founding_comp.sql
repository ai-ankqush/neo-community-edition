-- 0020: Founding Reviewer comp. A redeemable code grants an org full
-- (Enterprise-level) access for a time-boxed period, with no Stripe/card.
-- comp_until = when the free access ends; the dormancy cron reverts the plan.

alter table organizations add column if not exists comp_until timestamptz;
