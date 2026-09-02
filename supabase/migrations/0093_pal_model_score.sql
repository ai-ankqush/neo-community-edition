-- 0093_pal_model_score.sql
-- The trained model's verdict on each finding.
--
-- A finding's severity used to be hand-set. Now the BlackC PAL net (the same model behind the Action Fabric)
-- judges every candidate path: pal_score is its hostility probability (0..1), pal_top_feature is the model's
-- OWN attribution (which of its 18 behavioural features drove the verdict, via input-gradient). This is what
-- makes "PAL scored this 0.93, driven by `external`" a true statement rather than a rule dressed up as a model.

alter table pal_findings add column if not exists pal_score numeric;
alter table pal_findings add column if not exists pal_top_feature text;

comment on column pal_findings.pal_score is
  'Trained PAL model hostility probability (0..1) for this path. Findings are ranked by this, not by hand-set severity.';
comment on column pal_findings.pal_top_feature is
  'The action feature the model weighted most in its verdict (its own input-gradient attribution).';
