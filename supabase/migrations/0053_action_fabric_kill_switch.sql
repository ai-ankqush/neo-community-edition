-- 0053_action_fabric_kill_switch.sql
-- AI Action Fabric — the enforcement kill switch (RCDF L4 guardrail).
-- When halted, the Fabric stops enforcing and reverts to observe-only (the safe
-- failure mode for a defensive PEP: never keep blocking legitimate business
-- actions if something is wrong). Off by default.

alter table organizations
  add column if not exists enforcement_halted boolean not null default false;
