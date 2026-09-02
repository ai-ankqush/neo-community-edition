-- BYO model provider for the Community (free) tier — and, optionally, for paid
-- orgs that want model spend to bill to their own cloud/AI account.
--
-- The secret is encrypted at the APPLICATION layer (AES-256-GCM) before it is
-- written here; this column only ever holds ciphertext, never a plaintext key.
-- Reads/writes go through the service role only. model_meta holds NON-secret
-- config (e.g. region, model id, or a Bedrock cross-account role ARN).
alter table organizations
  add column if not exists model_provider text,                          -- 'anthropic' | 'bedrock' | 'vertex' | null
  add column if not exists model_secret_encrypted text,                  -- app-encrypted ciphertext (never plaintext)
  add column if not exists model_meta jsonb not null default '{}'::jsonb, -- non-secret config (region, model id, role arn)
  add column if not exists model_updated_at timestamptz;
