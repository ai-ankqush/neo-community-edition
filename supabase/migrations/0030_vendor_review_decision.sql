-- 0030: human buying-decision sign-off on a vendor review. `decision` /
-- `decision_rationale` hold the engine's rollup; these hold the recorded human
-- decision (mirrors use case: engine recommends, a person decides).
alter table vendor_reviews add column if not exists final_decision  text;   -- approve | conditions | defer | reject
alter table vendor_reviews add column if not exists final_rationale text;
alter table vendor_reviews add column if not exists decided_by      text;   -- clerk user id
alter table vendor_reviews add column if not exists decided_at      timestamptz;
