-- 0022: one-time FinOps backfill from the audit trail.
--
-- Historical assessment-stage token usage was recorded in audit_events under
-- action 'engine.generate' with detail = { stage, model, usage:{inputTokens,
-- outputTokens}, ... }. Reconstruct usage_events rows from it so /admin/finops
-- shows history.
--
-- NOTE: only assessment stages are recoverable. Artifacts (Build) and Red Team
-- audit entries did not store token counts, so their historical spend cannot be
-- reconstructed — it is captured going forward only.
--
-- Idempotent: the `at < earliest live-tracked row` guard prevents double-counting
-- rows already recorded by live tracking, and re-running inserts nothing because
-- backfilled rows carry their original (older) timestamps.

insert into usage_events (org_id, use_case_id, stage, model, input_tokens, output_tokens, created_at)
select
  ae.org_id,
  uc.id,                                                         -- null if the use case no longer exists (FK-safe)
  coalesce(ae.detail->>'stage', 'unknown'),
  coalesce(ae.detail->>'model', ''),
  coalesce((ae.detail->'usage'->>'inputTokens')::bigint, 0),
  coalesce((ae.detail->'usage'->>'outputTokens')::bigint, 0),
  ae.at
from audit_events ae
left join use_cases uc
  on ae.object_id ~ '^[0-9a-fA-F-]{36}$' and uc.id = ae.object_id::uuid
where ae.action = 'engine.generate'
  and ae.detail ? 'usage'
  and ae.at < coalesce((select min(created_at) from usage_events), now());
