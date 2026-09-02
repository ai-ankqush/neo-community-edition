-- 0085_sky_totp.sql
-- Two-factor authentication for Sky accounts (TOTP + single-use recovery codes).
--
-- The TOTP secret is stored ENCRYPTED (AES-256-GCM, key derived from SKY_SESSION_SECRET) so a database
-- leak alone yields no working second factor. Recovery codes are stored only as SHA-256 hashes.
-- Passkeys remain the phishing-resistant option; this covers the password path.

create table if not exists sky_totp (
  user_id          uuid primary key references sky_users(user_id) on delete cascade,
  secret_encrypted text not null,
  confirmed_at     timestamptz,          -- null = enrollment started but not yet proven
  created_at       timestamptz not null default now()
);
alter table sky_totp enable row level security;  -- deny-all; service role only

create table if not exists sky_recovery_codes (
  code_id    uuid primary key default gen_random_uuid(),
  user_id    uuid not null references sky_users(user_id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sky_recovery_codes_user_idx on sky_recovery_codes(user_id);
create unique index if not exists sky_recovery_codes_hash_idx on sky_recovery_codes(user_id, code_hash);
alter table sky_recovery_codes enable row level security;  -- deny-all; service role only
