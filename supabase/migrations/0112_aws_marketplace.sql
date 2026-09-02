-- AWS Marketplace SaaS fulfillment: map an AWS Marketplace customer to a Neo org.
-- Set when a buyer subscribes via Marketplace and lands on the fulfillment URL;
-- the entitlement check keeps plan/status in sync. Additive and safe.
alter table organizations
  add column if not exists aws_marketplace_customer_id text,   -- CustomerIdentifier from ResolveCustomer
  add column if not exists aws_marketplace_product_code text,  -- ProductCode from ResolveCustomer
  add column if not exists aws_marketplace_status text,        -- 'active' | 'expired' | 'pending'
  add column if not exists aws_marketplace_synced_at timestamptz;

create unique index if not exists organizations_aws_mp_customer_uidx
  on organizations (aws_marketplace_customer_id)
  where aws_marketplace_customer_id is not null;
