-- 0072_shadow_ai_tech_lane.sql
-- Shadow AI, second lane: FOLLOW THE TECH, then correlate with the money.
--
-- The money lane finds AI you PAY for. It cannot see AI used on a free tier, a personal card, or
-- embedded in a SaaS tool. The tech lane finds AI you USE — from technical signals (egress/DNS/
-- proxy to AI providers, SaaS OAuth grants, CASB/endpoint telemetry). Correlating the two is where
-- the value is:
--   money + tech  → confirmed, in use
--   money, no tech → paying for AI nobody visibly uses (waste, or a monitoring blind spot)
--   tech, no money → used but not paid through tracked channels — the riskiest shadow AI
--
-- Same table, same data-minimization discipline (NO personal identity — department/host-count only).

alter table shadow_ai_signals add column if not exists lane          text not null default 'money';  -- money | tech
alter table shadow_ai_signals add column if not exists signal_domain text;   -- tech lane: the AI destination observed (api.openai.com, claude.ai, ...)
alter table shadow_ai_signals add column if not exists usage_band    text;   -- tech lane: qualitative usage volume (High / Medium / Low) — never a raw count
alter table shadow_ai_signals add column if not exists observed_via  text;   -- tech lane: proxy | dns | casb | oauth | cloud_api  (which technical source saw it)

create index if not exists idx_shadow_ai_signals_lane on shadow_ai_signals (org_id, lane);
-- vendor + lane is the correlation join key
create index if not exists idx_shadow_ai_signals_vendor_lane on shadow_ai_signals (org_id, vendor, lane);

comment on column shadow_ai_signals.lane is
  'money = financial-signal discovery (spend); tech = technical-usage discovery (egress/DNS/OAuth/CASB). Correlated by normalized vendor to separate confirmed, paid-but-unseen, and used-but-unpaid AI.';
