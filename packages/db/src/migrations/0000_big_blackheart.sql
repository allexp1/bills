CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"provider_id" text,
	"category" text NOT NULL,
	"account_number_enc" "bytea",
	"nickname" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"mission_id" text,
	"text_enc" "bytea" NOT NULL,
	"granted_via" text,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"scope" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_pack_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"pack_id" text NOT NULL,
	"version" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"countries" jsonb,
	"rollout_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"customer_id" text,
	"provider_id" text,
	"mission_id" text,
	"peer_wa_id" text NOT NULL,
	"session_expires_at" timestamp with time zone,
	"state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"wa_id" text NOT NULL,
	"wa_hash" text NOT NULL,
	"display_name" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"currency" text,
	"country" text,
	"consent_tos_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decodes" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"extraction_id" text NOT NULL,
	"data" "bytea" NOT NULL,
	"guardrail_report" jsonb,
	"locale_rendered" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"invoice_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"pack_id" text,
	"pack_version" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"data" "bytea" NOT NULL,
	"confidence" jsonb,
	"usage" jsonb,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"account_id" text,
	"category" text,
	"status" text DEFAULT 'collecting' NOT NULL,
	"currency" text,
	"country" text,
	"billing_period_start" text,
	"billing_period_end" text,
	"issue_date" text,
	"due_date" text,
	"total_amount_minor" integer,
	"past_due_amount_minor" integer,
	"page_count" integer DEFAULT 0 NOT NULL,
	"summary_token_id" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"page_index" integer NOT NULL,
	"wa_media_id" text,
	"encryption_meta" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"wa_message_id" text,
	"type" text NOT NULL,
	"body_enc" "bytea",
	"media_object_id" text,
	"template_name" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"redactions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"account_id" text,
	"provider_id" text,
	"invoice_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"authorization_id" text,
	"goal" jsonb,
	"outcome" jsonb,
	"escalated_to_human_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"wa_number" text,
	"wa_verified_at" timestamp with time zone,
	"wa_verification_method" text,
	"support_hours" jsonb,
	"tos_review" jsonb,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "summary_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decodes" ADD CONSTRAINT "decodes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decodes" ADD CONSTRAINT "decodes_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_tokens" ADD CONSTRAINT "summary_tokens_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_peer_kind_idx" ON "conversations" USING btree ("peer_wa_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_wa_id_idx" ON "customers" USING btree ("wa_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_status_idx" ON "invoices" USING btree ("customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_wa_message_id_idx" ON "messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "summary_tokens_hash_idx" ON "summary_tokens" USING btree ("token_hash");