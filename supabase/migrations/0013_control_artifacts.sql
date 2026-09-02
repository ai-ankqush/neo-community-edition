-- 0013: generated engineering artifacts per control (Implementation Pack v2).
-- One artifact per control: Terraform / policy-as-code / config / runbook.
-- Generated on demand (LLM) and cached here so re-downloads are instant.

alter table control_items add column if not exists artifact_type         text;        -- terraform | policy | config | runbook
alter table control_items add column if not exists artifact_language     text;        -- hcl | rego | json | bash | markdown ...
alter table control_items add column if not exists artifact_filename     text;
alter table control_items add column if not exists artifact_content      text;
alter table control_items add column if not exists artifact_generated_at timestamptz;
