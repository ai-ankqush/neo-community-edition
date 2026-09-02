-- 0050_ai_supply_chain_build4.sql
-- AI Supply Chain Control (Build 4).
-- Persist the full derived ledger alongside each baseline snapshot, so history
-- and audit no longer depend on re-deriving (the derivation inputs can change).
-- The fingerprint stays the cheap diff key; `ledger` is the full record.

alter table ai_dependency_snapshots
  add column if not exists ledger jsonb;
