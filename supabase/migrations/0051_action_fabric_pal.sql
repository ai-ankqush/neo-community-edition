-- 0051_action_fabric_pal.sql
-- AI Action Fabric — record the PAL model's shadow signal on every decision.
-- The model SCORES; it does not change the verdict (shadow-first). Stored with
-- its version so we can A/B across retrains and graduate on proven agreement.

alter table action_decisions
  add column if not exists pal_p              double precision,  -- P(hostile) 0..1
  add column if not exists pal_logit          double precision,  -- pre-sigmoid (rankable)
  add column if not exists pal_hostile        boolean,           -- p >= threshold
  add column if not exists pal_model_version  text,
  add column if not exists pal_top_feature    text;              -- behavioural feature driving the score
