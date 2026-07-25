-- Opt-in retention: keep decoded bill data (encrypted, never images) past
-- the 7-day window for month-to-month comparison. Consent is timestamped
-- (demonstrable), revoked by the existing deletion flow.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "retention_consent_at" timestamptz;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "retention_prompted_at" timestamptz;
