-- Neo-internal credentials for bug-bounty platforms (HackerOne, Bugcrowd, ...).
-- One connection per platform. The token is AES-256-GCM encrypted (COMPOSER_ENC_KEY) before it ever touches the
-- row — only the ciphertext is stored. Used to sync program scope and vendor fix-frequency (Layer 2).

create table if not exists pal_platform_connections (
  platform        text primary key,                 -- hackerone | bugcrowd | intigriti | yeswehack
  handle          text,                              -- API username / identifier (not secret)
  secret_enc      text not null,                     -- encryptSecret({ token }) — base64 nonce||ct||tag
  enc_version     int  not null default 1,
  status          text not null default 'unverified',-- unverified | verified | error
  status_detail   text,
  verified_at     timestamptz,
  added_by        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table pal_platform_connections enable row level security;
-- Service-role only; no permissive policies. The token is never selected to the client — only status is.
