-- 0043_sc_decision_fingerprint.sql — close the supply-chain decision loop.
--
-- "Watch" is no longer a separate action. When you Accept risk or Mark reviewed,
-- Neo records the dependency's fingerprint at that moment (decided_fp). If the
-- dependency later changes (new CVE, confidence drop, model update, vendor verdict),
-- its current fingerprint no longer matches decided_fp → the decision is re-opened
-- for you to revisit. notified_fp dedupes the one-time bell alert per change.

alter table ai_dependency_annotations
  add column if not exists decided_fp  text,
  add column if not exists notified_fp text;
