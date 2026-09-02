-- AI Action Fabric — real SOC/SIEM forwarding config.
-- A webhook URL the customer configures and can send a test event to, so the
-- "Forward findings to your SOC" step actually does something instead of a flag.
alter table action_fabric_setup add column if not exists soc_webhook_url text;
