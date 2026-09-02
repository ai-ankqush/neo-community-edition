-- 0009: Stripe billing. The org's plan is still the source of truth for
-- entitlements; these columns link it to the Stripe subscription so the webhook
-- can keep `plan` in sync with what the customer is actually paying for.

alter table organizations add column if not exists stripe_customer_id     text;
alter table organizations add column if not exists stripe_subscription_id text;
alter table organizations add column if not exists billing_status         text;        -- active | past_due | canceled | trialing | ...
alter table organizations add column if not exists billing_cadence        text;        -- monthly | annual
alter table organizations add column if not exists current_period_end     timestamptz;

create index if not exists organizations_stripe_customer_idx on organizations (stripe_customer_id);
