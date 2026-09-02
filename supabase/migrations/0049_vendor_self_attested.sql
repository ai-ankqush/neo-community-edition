-- Self-attestation rung for AI vendors. A "single vendor, one status" model:
-- you either send the questionnaire to the vendor (a full review → "disclosed/evidenced")
-- or answer for it yourself (self-attest → "declared"). Self-attest is the customer's
-- assertion, NOT a vendor review — the AI Supply Chain treats it one notch above
-- "not assessed" but below a completed review.
alter table vendor_reviews
  add column if not exists self_attested boolean not null default false,
  add column if not exists self_attested_at timestamptz,
  add column if not exists self_attested_by text;
