-- 0070_calibration_learning.sql
-- The learning loop: keep BOTH numbers on every prediction.
--
-- `prior_confidence` = the reasoned number Neo started from (what I typed into the engine).
-- `confidence`       = the number Neo actually stated, after checking its own track record for
--                      this kind of claim at this strength.
--
-- Keeping both is what makes the self-adjustment auditable. A system that silently revises its own
-- confidence is not more trustworthy for being more accurate — you have to be able to see it move,
-- and see what moved it. The scorecard reads these two columns side by side.

alter table predictions add column if not exists prior_confidence numeric;

-- Backfill: everything predicted before the loop existed was, by definition, speaking its prior.
update predictions set prior_confidence = confidence where prior_confidence is null;

comment on column predictions.prior_confidence is
  'The reasoned prior Neo started from. `confidence` is what it actually said after learning from its own settled predictions. Divergence between the two is Neo changing its mind — visible on the Track Record page.';
