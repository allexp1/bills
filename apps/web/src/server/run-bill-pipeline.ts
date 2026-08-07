import { and, desc, eq, ne } from "drizzle-orm";
import {
  getPack,
  lookupProviderChat,
  playbookPack,
  statementMarketKey,
  withPlaybookHints,
  type PlaybookRecord,
} from "@bills/category-packs";
import { db, encryptJson, schema } from "@bills/db";
import { decodeBill, extractBill, gatherOffers, isOverloaded, translateBillView, type BillPage, type PriorBillSummary } from "@bills/llm";
import {
  applyGuardrails,
  billFingerprint,
  buildBillHistory,
  computeGotchaFacts,
  hashPages,
  mintSummaryToken,
  snapshotAmounts,
  snapshotFromExtraction,
  type BillSnapshot,
} from "@bills/pipeline";
import { SUPPORTED_LOCALES, parseAmount, type SupportedLocale } from "@bills/shared";
import { keys } from "./wiring.js";
import { env } from "./env.js";
import { loadGuardedDecode } from "./decode-store.js";
import { getOrResearchPlaybook, recordBillForPlaybook } from "./playbook-store.js";

export type PipelineStage = "extracting" | "market" | "researching" | "decoding" | "guardrails" | "finalizing";

export interface PipelineRunResult {
  summaryUrl: string;
  category: string;
  guardrail: { claims: number; dropped: number; removedSentences: number };
  offersConsidered: number;
  tokens: { extraction: unknown; decode: unknown };
}

/**
 * Returned instead of a run when this bill has already been decoded for this
 * customer. summaryUrl is a freshly minted link to the ORIGINAL bill: the
 * token they were given the first time is stored hashed and cannot be read
 * back, and it may well have expired, so a new one is issued for the same
 * invoice.
 *
 * `matchedOn` is surfaced because the two cases deserve different words. "The
 * same file" is unambiguous; "the same bill" is a judgement, and telling
 * someone which one it was lets them tell us we got it wrong.
 */
export interface DuplicateBillResult {
  duplicate: true;
  summaryUrl: string;
  matchedOn: "file" | "bill";
  originalInvoiceId: string;
  /** ISO timestamp of the original upload, so the message can say when. */
  originalDecodedAt: string;
  providerName: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

export type PipelineOutcome = PipelineRunResult | DuplicateBillResult;

export function isDuplicate(outcome: PipelineOutcome): outcome is DuplicateBillResult {
  return (outcome as DuplicateBillResult).duplicate === true;
}

export class PipelineError extends Error {
  constructor(
    readonly code: "unsupported_category" | "pipeline_error" | "overloaded",
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
  /**
   * Skip duplicate detection and decode it again regardless. Set when the
   * person was told it was a repeat and asked for a fresh run anyway, which is
   * a legitimate thing to want: the decoder improves, and a bill decoded in
   * March is not necessarily decoded as well as one decoded today.
   */
  force?: boolean;
}): Promise<PipelineOutcome> {
  const { customerId, locale, pages } = args;
  const progress = (stage: PipelineStage) => {
    try {
      args.onProgress?.(stage);
    } catch {
      // progress is cosmetic — never let it break the pipeline
    }
  };
  const database = db();

  /* Check one: the same file, re-sent. Before anything is inserted and before
     a single model call, because this is the common case and it should cost
     nothing. */
  const pagesHash = hashPages(pages);
  if (!args.force) {
    const seen = await findDuplicate(customerId, schema.invoices.pagesHash, pagesHash, args.invoiceId);
    if (seen) return await duplicateResult(seen, "file", args.invoiceId, pagesHash, null);
  }

  let invoiceId = args.invoiceId;
  if (!invoiceId) {
    const [invoice] = await database
      .insert(schema.invoices)
      .values({ customerId, status: "extracting", pageCount: pages.length, pagesHash })
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

    /* Check two: the same bill, photographed again. Different bytes, so the
       hash above saw nothing, but provider, account, period and total identify
       the document itself.

       Placed here rather than at the end because extraction is the cheap half.
       What follows is market research, a web search pass and the decode, and
       those are what a needless re-run actually costs.

       A null fingerprint means the extraction did not recover enough to be
       sure. It falls through and decodes normally: a wrong "you already sent
       this" hides a real bill, which is much worse than paying for one repeat. */
    const fingerprint = billFingerprint(extraction.common);
    if (fingerprint) {
      await database
        .update(schema.invoices)
        .set({ billFingerprint: fingerprint })
        .where(eq(schema.invoices.id, invoiceId));
    }
    if (fingerprint && !args.force) {
      const seen = await findDuplicate(customerId, schema.invoices.billFingerprint, fingerprint, invoiceId);
      if (seen) return await duplicateResult(seen, "bill", invoiceId, pagesHash, fingerprint);
    }

    const basePack = getPack(extraction.category);

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
        packId: basePack?.id ?? null,
        packVersion: basePack?.version ?? null,
        model,
        promptVersion,
        data: encryptJson(keys(), extraction),
        confidence: extraction.field_confidence ?? null,
        usage,
        status: extraction.category === "unknown" || extraction.category_confidence < 0.7 ? "low_confidence" : "ok",
      })
      .returning({ id: schema.extractions.id });
    if (!basePack) throw new PipelineError("unsupported_category", `category=${extraction.category}`);

    /**
     * Market knowledge for this (country, utility). For the open `utility`
     * category it IS the pack — glossary, gotchas and savings levers all come
     * from research, because a water bill in Israel and one in Spain have
     * almost nothing in common. For the bespoke packs it is additive: the
     * hand-written levers stay, and the researched market facts join them.
     *
     * The first bill in a new market pays for the research; every later one
     * reads the cached row, and volume milestones re-research with the wording
     * those bills actually used.
     */
    const marketKey =
      extraction.category === "utility"
        ? ((extraction.category_fields as Record<string, Record<string, unknown> | null>).utility?.serviceType as string | null) ?? "utility"
        : extraction.category === "statement"
          ? // pension | health_insurance | car_insurance | … — pension products
            // share one market, each insurance family gets its own.
            statementMarketKey(
              ((extraction.category_fields as Record<string, Record<string, unknown> | null>).statement?.kind as string | null) ?? null,
            )
          : extraction.category;
    let playbook: PlaybookRecord | null = null;
    if (extraction.common.country) {
      progress("market");
      const lookup = await getOrResearchPlaybook({
        country: extraction.common.country,
        // A hint, not a research target: a researched region row wins, a
        // missing one falls back to the country rather than costing a pass.
        region: extraction.common.region,
        utility: marketKey,
        language: extraction.common.billLanguage,
        providerName: extraction.common.providerName,
        // Only the open category may block on research; a mobile bill must
        // never wait on a slow web-search pass it can succeed without.
        cachedOnly: extraction.category !== "utility",
      }).catch(() => ({ record: null, researched: false }));
      playbook = lookup.record;
    }
    const pack = !playbook
      ? basePack
      : extraction.category === "utility"
        ? playbookPack({ utility: "utility", country: playbook.country, record: playbook })
        : withPlaybookHints(basePack, playbook);

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
    // NOT for statements: the insurance/pension product is explanation only,
    // deliberately — "here is a cheaper fund" crosses into licensed financial
    // advice in the launch market, so no offer search runs at all.
    progress("researching");
    const fields = (extraction.category_fields as Record<string, unknown>)[pack.id];
    const offers = pack.id === "statement" ? [] : await gatherOffers(pack.id, fields, extraction.common);
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

    // Feed this bill's market vocabulary back into the playbook so the next
    // bill of the same kind is decoded better. Labels only, digits stripped,
    // promoted only above the k-anonymity threshold — see playbook-store.
    await recordBillForPlaybook({
      country: extraction.common.country,
      region: extraction.common.region,
      utility: marketKey,
      providerName: extraction.common.providerName,
      lineItemLabels: extraction.common.lineItems.map((li) => li.label),
      language: extraction.common.billLanguage,
    });

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
    /* An overload is the service being busy, not this bill being unreadable.
       Recorded under its own code so a retry that then succeeds does not leave
       a row claiming the bill failed, and so the caller can say "try again in a
       moment" rather than showing somebody a raw 529 JSON body, which is what
       happened on the first multi-bill upload. */
    const code = err instanceof PipelineError ? err.code : isOverloaded(err) ? "overloaded" : "pipeline_error";
    await database.update(schema.invoices).set({ status: "failed", errorCode: code }).where(eq(schema.invoices.id, invoiceId));
    if (code === "overloaded" && !(err instanceof PipelineError)) {
      throw new PipelineError("overloaded", "the analysis service is busy");
    }
    throw err;
  }
}

/**
 * The customer's prior delivered bills for the same provider+category,
 * oldest first (up to 5): snapshots for the pure-code diff plus printed-
 * string summaries for the decode context. Best-effort — returns [] when
 * migration 0001 (provider_name) isn't applied or extractions are gone.
 */
/**
 * The earlier invoice this one repeats, or null.
 *
 * Scoped to the customer, always. Two tenants of the same building get
 * byte-identical bills from the same landlord, and treating those as
 * duplicates of each other would be both wrong and a disclosure that someone
 * else's bill exists.
 *
 * Only `delivered` rows count. A half-finished or failed run is not a bill the
 * person can be sent back to, so matching one would mean answering "you
 * already have this" with a link to nothing.
 */
async function findDuplicate(
  customerId: string,
  column: typeof schema.invoices.pagesHash | typeof schema.invoices.billFingerprint,
  value: string,
  excludeInvoiceId: string | undefined,
) {
  try {
    const rows = await db()
      .select({
        id: schema.invoices.id,
        createdAt: schema.invoices.createdAt,
        providerName: schema.invoices.providerName,
        billingPeriodStart: schema.invoices.billingPeriodStart,
        billingPeriodEnd: schema.invoices.billingPeriodEnd,
      })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.customerId, customerId),
          eq(column, value),
          eq(schema.invoices.status, "delivered"),
          ...(excludeInvoiceId ? [ne(schema.invoices.id, excludeInvoiceId)] : []),
        ),
      )
      .orderBy(desc(schema.invoices.createdAt))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    /* A duplicate check must never be the reason a bill fails to decode. On a
       database where migration 0008 has not been applied these columns do not
       exist; falling through means the old behaviour, which is a duplicate,
       not a failure. */
    console.warn(
      "[pipeline] duplicate check skipped (migration 0008 applied?):",
      err instanceof Error ? err.message.slice(0, 120) : "",
    );
    return null;
  }
}

/**
 * Closes out the current attempt and hands back a link to the original.
 *
 * The in-flight row is marked `duplicate` rather than deleted. It keeps the
 * portfolio clean either way, and it leaves a record that someone tried to
 * send this twice, which is the signal that tells us whether the first upload
 * appeared to fail.
 *
 * The link is newly minted. The original token exists only as a hash and may
 * have expired, and a re-upload is a reasonable moment to hand out a fresh one
 * for a bill this person already owns.
 */
async function duplicateResult(
  original: {
    id: string;
    createdAt: Date;
    providerName: string | null;
    billingPeriodStart: string | null;
    billingPeriodEnd: string | null;
  },
  matchedOn: "file" | "bill",
  attemptInvoiceId: string | undefined,
  pagesHash: string,
  fingerprint: string | null,
): Promise<DuplicateBillResult> {
  const database = db();

  if (attemptInvoiceId) {
    await database
      .update(schema.invoices)
      .set({
        status: "duplicate",
        duplicateOfInvoiceId: original.id,
        pagesHash,
        ...(fingerprint ? { billFingerprint: fingerprint } : {}),
      })
      .where(eq(schema.invoices.id, attemptInvoiceId))
      .catch(() => {
        /* Same reasoning as findDuplicate: never fail the request over
           bookkeeping. The person still gets their link. */
      });
  }

  const minted = mintSummaryToken(original.id, env.summaryJwtSecret);
  const [tokenRow] = await database
    .insert(schema.summaryTokens)
    .values({ invoiceId: original.id, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt })
    .returning({ id: schema.summaryTokens.id });
  if (tokenRow) {
    /* Point the original at the newest token so the portfolio's own link keeps
       working too, rather than staying on one that is closer to expiring. */
    await database
      .update(schema.invoices)
      .set({ summaryTokenId: tokenRow.id })
      .where(eq(schema.invoices.id, original.id))
      .catch(() => {});
  }

  return {
    duplicate: true,
    summaryUrl: `${env.summaryBaseUrl}/s/${minted.token}`,
    matchedOn,
    originalInvoiceId: original.id,
    originalDecodedAt: original.createdAt.toISOString(),
    providerName: original.providerName,
    billingPeriodStart: original.billingPeriodStart,
    billingPeriodEnd: original.billingPeriodEnd,
  };
}

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
