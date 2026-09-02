-- AI Action Fabric — per-use-case environment (test vs prod).
-- Gates the enforcement fast-path: a "test" use case can graduate an action to
-- Autonomous without a shadow soak (experiment freely); "prod" keeps the proof gate.
-- Default 'prod' is the safe default — nothing gets the fast path until the customer
-- consciously marks a use case as test and accepts the disclaimer.
alter table use_cases add column if not exists af_environment text not null default 'prod';
