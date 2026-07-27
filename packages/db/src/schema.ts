import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ulid } from "@bills/shared";

/** Envelope-encrypted payload column (JSON envelope stored as bytea). */
const encrypted = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => ulid());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

export const customers = pgTable(
  "customers",
  {
    id: id(),
    waId: text("wa_id").notNull(),
    waHash: text("wa_hash").notNull(),
    displayName: text("display_name"),
    locale: text("locale").notNull().default("en"),
    currency: text("currency"),
    country: text("country"),
    consentTosAt: timestamp("consent_tos_at", { withTimezone: true }),
    /** Opt-in: keep decoded bill data (encrypted, never images) past 7 days for month-to-month comparison. */
    retentionConsentAt: timestamp("retention_consent_at", { withTimezone: true }),
    /** When we asked (WhatsApp asks once, post-first-delivery). */
    retentionPromptedAt: timestamp("retention_prompted_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("customers_wa_id_idx").on(t.waId)],
);

export const providers = pgTable("providers", {
  id: id(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  defaultLocale: text("default_locale").notNull().default("en"),
  waNumber: text("wa_number"),
  waVerifiedAt: timestamp("wa_verified_at", { withTimezone: true }),
  waVerificationMethod: text("wa_verification_method"),
  supportHours: jsonb("support_hours"),
  tosReview: jsonb("tos_review"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"), // draft | verified | blocked
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accounts = pgTable("accounts", {
  id: id(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  providerId: text("provider_id").references(() => providers.id),
  category: text("category").notNull(),
  accountNumberEnc: encrypted("account_number_enc"),
  nickname: text("nickname"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    customerId: text("customer_id").notNull().references(() => customers.id),
    accountId: text("account_id").references(() => accounts.id),
    category: text("category"),
    status: text("status").notNull().default("collecting"),
    currency: text("currency"),
    country: text("country"),
    billingPeriodStart: text("billing_period_start"), // ISO dates as text (bill-sourced)
    billingPeriodEnd: text("billing_period_end"),
    issueDate: text("issue_date"),
    dueDate: text("due_date"),
    totalAmountMinor: integer("total_amount_minor"),
    pastDueAmountMinor: integer("past_due_amount_minor"),
    pageCount: integer("page_count").notNull().default(0),
    summaryTokenId: text("summary_token_id"),
    errorCode: text("error_code"),
    /** Plain provider name for history matching across months (not sensitive). */
    providerName: text("provider_name"),
    /** Bill-sourced ISO dates surfaced for the renegotiation-timing cron. */
    promoEndDate: text("promo_end_date"),
    contractEndDate: text("contract_end_date"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("invoices_customer_status_idx").on(t.customerId, t.status)],
);

export const mediaObjects = pgTable("media_objects", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  pageIndex: integer("page_index").notNull(),
  waMediaId: text("wa_media_id"),
  encryptionMeta: jsonb("encryption_meta"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const extractions = pgTable("extractions", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  attempt: integer("attempt").notNull().default(1),
  packId: text("pack_id"),
  packVersion: text("pack_version"),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  data: encrypted("data").notNull(),
  confidence: jsonb("confidence"),
  usage: jsonb("usage"),
  status: text("status").notNull().default("ok"), // ok | low_confidence | failed
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const decodes = pgTable("decodes", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  extractionId: text("extraction_id").notNull().references(() => extractions.id),
  data: encrypted("data").notNull(),
  guardrailReport: jsonb("guardrail_report"),
  localeRendered: text("locale_rendered").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  usage: jsonb("usage"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const summaryTokens = pgTable(
  "summary_tokens",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("summary_tokens_hash_idx").on(t.tokenHash)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    kind: text("kind").notNull(), // customer | provider
    channel: text("channel").notNull().default("whatsapp"),
    customerId: text("customer_id").references(() => customers.id),
    providerId: text("provider_id").references(() => providers.id),
    missionId: text("mission_id"),
    peerWaId: text("peer_wa_id").notNull(),
    sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
    state: jsonb("state"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversations_peer_kind_idx").on(t.peerWaId, t.kind)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id),
    direction: text("direction").notNull(), // in | out
    waMessageId: text("wa_message_id"),
    type: text("type").notNull(),
    bodyEnc: encrypted("body_enc"),
    mediaObjectId: text("media_object_id"),
    templateName: text("template_name"),
    status: text("status").notNull().default("queued"),
    redactions: jsonb("redactions"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("messages_wa_message_id_idx").on(t.waMessageId)],
);

export const authorizations = pgTable("authorizations", {
  id: id(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  missionId: text("mission_id"),
  textEnc: encrypted("text_enc").notNull(),
  grantedVia: text("granted_via"),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  scope: jsonb("scope").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const missions = pgTable("missions", {
  id: id(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  accountId: text("account_id").references(() => accounts.id),
  providerId: text("provider_id").references(() => providers.id),
  invoiceId: text("invoice_id").references(() => invoices.id),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("draft"),
  authorizationId: text("authorization_id"),
  goal: jsonb("goal"),
  outcome: jsonb("outcome"),
  escalatedToHumanAt: timestamp("escalated_to_human_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const deletionRequests = pgTable("deletion_requests", {
  id: id(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  scope: text("scope").notNull().default("all"), // all | invoice
  invoiceId: text("invoice_id"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const categoryPackRegistry = pgTable("category_pack_registry", {
  id: id(),
  packId: text("pack_id").notNull(),
  version: text("version").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  countries: jsonb("countries").$type<string[]>(),
  rolloutNotes: text("rollout_notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * ANONYMOUS usage statistics — deliberately no foreign keys, no customer or
 * invoice linkage, no account data, and month-level time resolution only.
 * Rows here are irreversibly unlinkable to a person (true anonymization, not
 * pseudonymization), which is what lets them outlive the 7-day deletion of
 * the decoded bill data. Never add a linking column to this table.
 */
export const billStats = pgTable("bill_stats", {
  id: id(),
  /** Billing month YYYY-MM (from the bill's own dates). */
  billMonth: text("bill_month"),
  category: text("category"),
  country: text("country"),
  currency: text("currency"),
  providerName: text("provider_name"),
  totalMinor: integer("total_minor"),
  savingsCount: integer("savings_count").notNull().default(0),
  savingsTotalMinor: integer("savings_total_minor"),
  verdictVerified: integer("verdict_verified").notNull().default(0),
  verdictComputed: integer("verdict_computed").notNull().default(0),
  verdictFlagged: integer("verdict_flagged").notNull().default(0),
  verdictDropped: integer("verdict_dropped").notNull().default(0),
  offersConsidered: integer("offers_considered").notNull().default(0),
  hadPitch: boolean("had_pitch").notNull().default(false),
  locale: text("locale"),
  /** Month the analysis ran, YYYY-MM — coarse on purpose. */
  createdMonth: text("created_month").notNull(),
});

/**
 * Researched market knowledge for one (country, utility) pair — how that
 * utility is billed, regulated and discounted in that country.
 *
 * GLOBAL BY DESIGN, and deliberately free of customer linkage. Playbooks are
 * public market facts with cited sources, so they are safe to share across
 * every customer and, later, across every tenant: research one tenant paid
 * for makes the product smarter for all of them. That is also why nothing
 * here survives a deletion request — there is nothing personal in it to
 * delete. `observations` holds only line-item WORDING with digits stripped,
 * counted across distinct bills and never promoted below the k-anonymity
 * threshold in `MIN_DISTINCT_BILLS`.
 *
 * Multi-tenancy note: when tenants arrive, this table stays global. A tenant
 * wanting private overrides gets a separate nullable-tenant override table
 * layered on top — never a tenant_id here, or the shared-learning property
 * that makes this design worthwhile is lost.
 */
export const utilityPlaybooks = pgTable(
  "utility_playbooks",
  {
    id: id(),
    /** ISO-3166 alpha-2, uppercase. */
    country: text("country").notNull(),
    /** Utility slug: water, waste, council_tax, insurance, mobile, energy… */
    utility: text("utility").notNull(),
    /** Bumped on every successful re-research. */
    version: integer("version").notNull().default(1),
    /** Shape version of `data`, so old rows can be migrated or ignored. */
    schemaVersion: integer("schema_version").notNull().default(1),
    /**
     * The UtilityPlaybook document. Public knowledge — not encrypted.
     * Null while the row is queued for research but not yet researched.
     */
    data: jsonb("data"),
    /** Anonymised {label, count} line-item wording seen on bills of this kind. */
    observations: jsonb("observations").$type<Array<{ label: string; count: number }>>(),
    /** Distinct bills of this (country, utility) analysed so far. */
    billsSeen: integer("bills_seen").notNull().default(0),
    /** Provider names seen in this market — public company names. */
    providers: jsonb("providers").$type<string[]>(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    /** ok | pending | failed — `pending` rows are the warming cron's queue. */
    status: text("status").notNull().default("ok"),
    /** Lower drains first, so launch markets warm before speculative ones. */
    priority: integer("priority").notNull().default(100),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    researchedAt: timestamp("researched_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("utility_playbooks_key_idx").on(t.country, t.utility)],
);
