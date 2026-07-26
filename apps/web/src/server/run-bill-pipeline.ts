import { and, desc, eq, ne } from "drizzle-orm";
import { getPack, lookupProviderChat } from "@bills/category-packs";
import { db, encryptJson, schema } from "@bills/db";
import { decodeBill, extractBill, gatherOffers, translateBillView, type BillPage, type PriorBillSummary } from "@bills/llm";
import {
  applyGuardrails,
  buildBillHistory,
  computeGotchaFacts,
  mintSummaryToken,
  snapshotAmounts,
  snapshotFromExtraction,
  type BillSnapshot,
} from "@bills/pipeline";
import { SUPPORTED_LOCALES, parseAmount, type SupportedLocale } from "@bills/shared";
import { keys } from "./wiring.js";
import { env } from "./env.js";
import { loadGuardedDecode } from "./decode-store.js";

export type PipelineStage = "extracting" | "researching" | "decoding" | "guardrails" | "finalizing";

export interface PipelineRunResult {
  summaryUrl: string;
  category: string;
  guardrail: { claims: number; dropped: number; removedSentences: number };
  offersConsidered: number;
  tokens: { extraction: unknown; decode: unknown };
}

export class PipelineError extends Error {
  constructor(
    readonly code: "unsupported_category" | "pipeline_error",
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

/**
 * The Part-A core: store pages (encrypted) → vision extraction → live market
 * offers → decode → guardrails → signed summary link. Shared by the public
 * upload, the dev harness, and the WhatsApp job processor.
 */
export async function runBillPipeline(args: {
  customerId: string;
  invoiceId?: string; // WhatsApp flow passes an existing collecting invoice
  pages: BillPage[];
  locale: SupportedLocale;
  /** Stage callback for live progress UIs (web upload streams these). */
  onProgress?: (stage: PipelineStage) => void;
  /** Translate the bill's own text into the customer's language — OPT-IN: bill language is the default. */
  translate?: boolean;
}): Promise<PipelineRunResult> {
  const { customerId, locale, pages } = args;
  const progress = (stage: PipelineStage) => {
    try {
      args.onProgress?.(stage);
    } catch {
      // progress is cosmetic — never let it break the pipeline
    }
  };
  const database = db();

  let invoiceId = args.invoiceId;
  if (!invoiceId) {
    const [invoice] = await database
      .insert(schema.invoices)
      .values({ customerId, status: "extracting", pageCount: pages.length })
      .returning({ id: schema.invoices.id });
    invoiceId = invoice!.id;
    // No-retention policy: uploaded pages are processed from memory only.
    // What persists is the structured extraction, encrypted, in the DB —
    // never the images/PDFs themselves. (The WhatsApp path stores pages
    // transiently because they arrive over minutes into an async job; it
    // deletes them right after processing.)
  }

  try {
    await database.update(schema.invoices).set({ status: "extracting" }).where(eq(schema.invoices.id, invoiceId));

    progress("extracting");
    const { extraction, usage, model, promptVersion } = await extractBill(pages);
    const pack = getPack(extraction.category);

    // Language policy: everything renders in the BILL's language by default —
    // a Hebrew bill gets a Hebrew page. The requested locale applies only
    // when the customer asked for translation, or when the bill's language
    // isn't one we can render.
    const billBase = (extraction.common.billLanguage ?? "").toLowerCase().slice(0, 2);
    const renderLocale: SupportedLocale =
      !args.translate && (SUPPORTED_LOCALES as readonly string[]).includes(billBase)
        ? (billBase as SupportedLocale)
        : locale;
    const [extractionRow] = await database
      .insert(schema.extractions)
      .values({
        invoiceId,
        packId: pack?.id ?? null,
        packVersion: pack?.version ?? null,
        model,
        promptVersion,
        data: encryptJson(keys(), extraction),
        confidence: extraction.field_confidence ?? null,
        usage,
        status: extraction.category === "unknown" || extraction.category_confidence < 0.7 ? "low_confidence" : "ok",
      })
      .returning({ id: schema.extractions.id });
    if (!pack) throw new PipelineError("unsupported_category", `category=${extraction.category}`);

    await database
      .update(schema.invoices)
      .set({
        status: "decoding",
        category: extraction.category,
        currency: extraction.common.currency,
        country: extraction.common.country,
        billingPeriodStart: extraction.common.billingPeriodStart,
        billingPeriodEnd: extraction.common.billingPeriodEnd,
        issueDate: extraction.common.issueDate,
        dueDate: extraction.common.dueDate,
        totalAmountMinor: extraction.common.totalAmount
          ? parseAmount(extraction.common.totalAmount, extraction.common.currency ?? "EUR")
          : null,
        pastDueAmountMinor: extraction.common.pastDueAmount
          ? parseAmount(extraction.common.pastDueAmount, extraction.common.currency ?? "EUR")
          : null,
      })
      .where(eq(schema.invoices.id, invoiceId));

    // History/reminder metadata — separate best-effort write so the pipeline
    // keeps working on databases where migration 0001 isn't applied yet.
    const isoDate = (v: unknown): string | null =>
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    const rawFields = (extraction.category_fields as Record<string, Record<string, unknown> | null>)[
      extraction.category
    ];
    await database
      .update(schema.invoices)
      .set({
        providerName: extraction.common.providerName,
        promoEndDate: isoDate(rawFields?.promoEndDate),
        contractEndDate: isoDate(rawFields?.contractEndDate),
      })
      .where(eq(schema.invoices.id, invoiceId))
      .catch((err: unknown) => {
        console.warn("[pipeline] history columns write failed (migration 0001 applied?):", err instanceof Error ? err.message.slice(0, 120) : "");
      });

    // Prior bills of the same provider+category → month-over-month comparison.
    const priorSnapshots = await loadPriorSnapshots(customerId, invoiceId, extraction.common.providerName, pack.id);

    // Live market research (web search) merged with curated data — best-effort.
    progress("researching");
    const fields = (extraction.category_fields as Record<string, unknown>)[pack.id];
    const offers = await gatherOffers(pack.id, fields, extraction.common);
    const gotchaFacts = computeGotchaFacts(pack, extraction);

    progress("decoding");
    const decodeResult = await decodeBill({
      extraction,
      pack,
      gotchaFacts,
      offers,
      customerLocale: renderLocale,
      priorBills: priorSnapshots.map((p) => p.summary),
    });

    progress("guardrails");
    await database.update(schema.invoices).set({ status: "guardrail" }).where(eq(schema.invoices.id, invoiceId));
    const { guarded, report } = applyGuardrails({
      decode: decodeResult.decode,
      extraction,
      pack,
      offers,
      locale: renderLocale,
      priorAmounts: priorSnapshots.flatMap((p) => snapshotAmounts(p.snapshot)),
    });

    const history = buildBillHistory(
      snapshotFromExtraction(invoiceId, extraction),
      priorSnapshots.map((p) => p.snapshot),
    );
    if (history) guarded.history = history;

    progress("finalizing");
    // Bill-view translation (LQA-verified) — only when the customer asked
    // for it; the bill's own language is the default. Best-effort.
    try {
      const translation = args.translate ? await translateBillView({ extraction, targetLanguage: locale }) : null;
      if (translation) {
        guarded.translation = {
          language: translation.language,
          lineItemLabels: translation.lineItemLabels,
          printedNextSteps: translation.printedNextSteps,
          discountLabels: translation.discountLabels,
          lqa: translation.lqa,
        };
      }
    } catch (err) {
      console.warn("[pipeline] translation skipped:", err instanceof Error ? err.message.slice(0, 120) : "");
    }

    // If the provider has a source-confirmed official support-chat channel
    // (WhatsApp, SMS short code, or web chat), attach it so both renderers
    // can offer the customer a way in — preloaded message where possible.
    const providerChat = await lookupProviderChat(extraction.common.providerName, extraction.common.country, pack.id);
    if (providerChat) {
      guarded.providerChat = {
        providerName: extraction.common.providerName ?? providerChat.name,
        channel: providerChat.channel ?? "whatsapp",
        ...(providerChat.waNumber ? { waNumber: providerChat.waNumber } : {}),
        ...(providerChat.smsNumber ? { smsNumber: providerChat.smsNumber } : {}),
        ...(providerChat.smsBody ? { smsBody: providerChat.smsBody } : {}),
        ...(providerChat.chatUrl ? { chatUrl: providerChat.chatUrl } : {}),
        source: providerChat.source,
      };
    }

    await database.insert(schema.decodes).values({
      invoiceId,
      extractionId: extractionRow!.id,
      data: encryptJson(keys(), guarded),
      guardrailReport: report,
      localeRendered: renderLocale,
      model: decodeResult.model,
      promptVersion: decodeResult.promptVersion,
      usage: decodeResult.usage,
    });

    const minted = mintSummaryToken(invoiceId, env.summaryJwtSecret);
    const [tokenRow] = await database
      .insert(schema.summaryTokens)
      .values({ invoiceId, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt })
      .returning({ id: schema.summaryTokens.id });
    await database
      .update(schema.invoices)
      .set({ status: "delivered", summaryTokenId: tokenRow!.id })
      .where(eq(schema.invoices.id, invoiceId));

    // Anonymous stats row — whitelist only, no linkage to customer/invoice,
    // month-level time. This is what legitimately survives the 7-day
    // deletion of the decoded data. Fail-soft (migration 0002).
    await database
      .insert(schema.billStats)
      .values({
        billMonth: (extraction.common.billingPeriodEnd ?? extraction.common.issueDate ?? "").slice(0, 7) || null,
        category: extraction.category,
        country: extraction.common.country,
        currency: extraction.common.currency,
        providerName: extraction.common.providerName,
        totalMinor: extraction.common.totalAmount
          ? parseAmount(extraction.common.totalAmount, extraction.common.currency ?? "EUR")
          : null,
        savingsCount: guarded.savings.length,
        savingsTotalMinor: guarded.savings.reduce<number | null>(
          (acc, s) => (s.amountMinor === null ? acc : (acc ?? 0) + s.amountMinor),
          null,
        ),
        verdictVerified: report.claims.filter((c) => c.verdict === "verified").length,
        verdictComputed: report.claims.filter((c) => c.verdict === "computed").length,
        verdictFlagged: report.claims.filter((c) => c.verdict === "flagged").length,
        verdictDropped: report.claims.filter((c) => c.verdict === "dropped").length,
        offersConsidered: offers.length,
        hadPitch: guarded.pitch !== undefined,
        locale,
        createdMonth: new Date().toISOString().slice(0, 7),
      })
      .catch((err: unknown) => {
        console.warn("[pipeline] stats write failed (migration 0002 applied?):", err instanceof Error ? err.message.slice(0, 120) : "");
      });

    return {
      summaryUrl: `${env.summaryBaseUrl}/s/${minted.token}`,
      category: extraction.category,
      guardrail: { claims: report.claims.length, dropped: report.droppedCount, removedSentences: report.removedSentences.length },
      offersConsidered: offers.length,
      tokens: { extraction: usage, decode: decodeResult.usage },
    };
  } catch (err) {
    const code = err instanceof PipelineError ? err.code : "pipeline_error";
    await database.update(schema.invoices).set({ status: "failed", errorCode: code }).where(eq(schema.invoices.id, invoiceId));
    throw err;
  }
}

/**
 * The customer's prior delivered bills for the same provider+category,
 * oldest first (up to 5): snapshots for the pure-code diff plus printed-
 * string summaries for the decode context. Best-effort — returns [] when
 * migration 0001 (provider_name) isn't applied or extractions are gone.
 */
async function loadPriorSnapshots(
  customerId: string,
  currentInvoiceId: string,
  providerName: string | null,
  category: string,
): Promise<Array<{ snapshot: BillSnapshot; summary: PriorBillSummary }>> {
  if (!providerName) return [];
  try {
    const rows = await db()
      .select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.customerId, customerId),
          eq(schema.invoices.status, "delivered"),
          eq(schema.invoices.providerName, providerName),
          eq(schema.invoices.category, category),
          ne(schema.invoices.id, currentInvoiceId),
        ),
      )
      .orderBy(desc(schema.invoices.createdAt))
      .limit(5);

    const out: Array<{ snapshot: BillSnapshot; summary: PriorBillSummary }> = [];
    for (const row of rows) {
      const loaded = await loadGuardedDecode(row.id).catch(() => null);
      if (!loaded) continue;
      const snapshot = snapshotFromExtraction(row.id, loaded.extraction);
      out.push({
        snapshot,
        summary: {
          period: snapshot.period,
          totalAsPrinted: loaded.extraction.common.totalAmount,
          lineItems: loaded.extraction.common.lineItems.map((li) => ({ label: li.label, amount: li.amount })),
        },
      });
    }
    return out.reverse(); // oldest first
  } catch {
    return [];
  }
}
