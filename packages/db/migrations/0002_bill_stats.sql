-- Anonymous usage statistics: no FKs, no customer/invoice linkage,
-- month-level time resolution only. Survives the 7-day data deletion
-- because rows are irreversibly unlinkable to a person.
CREATE TABLE IF NOT EXISTS "bill_stats" (
  "id" text PRIMARY KEY,
  "bill_month" text,
  "category" text,
  "country" text,
  "currency" text,
  "provider_name" text,
  "total_minor" integer,
  "savings_count" integer NOT NULL DEFAULT 0,
  "savings_total_minor" integer,
  "verdict_verified" integer NOT NULL DEFAULT 0,
  "verdict_computed" integer NOT NULL DEFAULT 0,
  "verdict_flagged" integer NOT NULL DEFAULT 0,
  "verdict_dropped" integer NOT NULL DEFAULT 0,
  "offers_considered" integer NOT NULL DEFAULT 0,
  "had_pitch" boolean NOT NULL DEFAULT false,
  "locale" text,
  "created_month" text NOT NULL
);
ALTER TABLE "bill_stats" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "bill_stats" TO "bills_app";
DROP POLICY IF EXISTS "bills_app_all_bill_stats" ON "bill_stats";
CREATE POLICY "bills_app_all_bill_stats" ON "bill_stats" FOR ALL TO "bills_app" USING (true) WITH CHECK (true);
