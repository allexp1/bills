-- Renegotiation-timing reminders + multi-month history matching.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "provider_name" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "promo_end_date" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "contract_end_date" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamptz;
CREATE INDEX IF NOT EXISTS "invoices_customer_provider_idx" ON "invoices" ("customer_id", "provider_name", "category");
