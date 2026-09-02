-- Integration Composer: encrypt customer credentials at rest.
-- The plaintext `credential` jsonb is deprecated in favour of `credential_enc`
-- (AES-256-GCM ciphertext, base64: nonce || ciphertext || authTag). The master key
-- lives outside the DB (COMPOSER_ENC_KEY). `enc_version` lets the scheme/key rotate.

alter table ai_custom_connectors
  add column if not exists credential_enc text,
  add column if not exists enc_version int not null default 1;

-- plaintext column is no longer written; keep it nullable for any legacy demo rows
alter table ai_custom_connectors alter column credential drop not null;

comment on column ai_custom_connectors.credential_enc is 'AES-256-GCM ciphertext of the read-only credential (base64: iv||ct||tag). Decrypted only in memory at verify time.';
comment on column ai_custom_connectors.credential is 'DEPRECATED — plaintext credential. Do not write. Use credential_enc.';
