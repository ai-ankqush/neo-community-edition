-- 0091_pal_live_execution.sql
-- Live execution results + the human approval Gravity requires.
--
-- A live run (PAL actually invoking a self-owned MCP server's tools) is classified irreversible, so Gravity's
-- gate returns REQUIRE — it demands explicit human authorization. That human confirmation is recorded here on
-- the run: `human_approved` is the person clearing it, tied to the same `gravity_decision_id` that required
-- it. The live transcript (reads actually invoked; destructive steps proven-reachable but withheld) lands in
-- `live_result` for the evidence ledger.

alter table pal_runs add column if not exists human_approved boolean not null default false;
alter table pal_runs add column if not exists live_endpoint text;
alter table pal_runs add column if not exists live_result jsonb;

comment on column pal_runs.human_approved is
  'For a live run: the explicit human authorization that satisfies Gravity''s REQUIRE verdict. A live run cannot proceed without it.';
comment on column pal_runs.live_result is
  'Transcript of the live invocation: per-step invoked/withheld/ok + a sha256 transcript digest. Reads are actually called; destructive/outbound steps are proven reachable but withheld so the invoker never causes the harm it demonstrates.';
