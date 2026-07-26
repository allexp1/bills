import { NextRequest, NextResponse } from "next/server";
import { gte } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { resolveLocale, waHash, type SupportedLocale } from "@bills/shared";
import type { BillPage } from "@bills/llm";
import { env } from "../../../server/env.js";
import { billQuotaExceeded } from "../../../server/rate-limit.js";
import { PipelineError, runBillPipeline } from "../../../server/run-bill-pipeline.js";

export const runtime = "nodejs";
export const maxDuration = 800;

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const GLOBAL_BILLS_PER_DAY = Number(process.env.GLOBAL_BILLS_PER_DAY ?? 200);

/**
 * Public bill upload. No account: rate limiting keys on a hashed client IP
 * (the hash is the same pseudonym scheme used for WhatsApp numbers — no raw
 * IPs are stored), with a global daily cap bounding total model spend.
 */
export async function POST(req: NextRequest) {
  try {
    // Global spend cap first.
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const recent = await db()
      .select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(gte(schema.invoices.createdAt, since));
    if (recent.length >= GLOBAL_BILLS_PER_DAY) {
      return NextResponse.json(
        { error: "at_capacity", detail: "Daily analysis capacity reached — please try again tomorrow." },
        { status: 503 },
      );
    }

    // Per-IP pseudonymous customer.
    const ip = (req.headers.get("x-forwarded-for") ?? "0.0.0.0").split(",")[0]!.trim();
    const webId = `web:${waHash(ip, env.waHashPepper)}`;
    const customer = await upsertWebCustomer(webId);
    if (await billQuotaExceeded(customer.id)) {
      return NextResponse.json(
        { error: "quota", detail: "You've reached today's limit of analyzed bills — try again tomorrow." },
        { status: 429 },
      );
    }

    const form = await req.formData();
    const locale = resolveLocale(String(form.get("locale") ?? "en")) as SupportedLocale;

    // Opt-in retention (checkbox). Setting only — an unticked box on a later
    // upload never silently revokes earlier consent; "delete" always does.
    if (form.get("retain") === "on" && !customer.retentionConsentAt) {
      const { eq } = await import("drizzle-orm");
      await db()
        .update(schema.customers)
        .set({ retentionConsentAt: new Date(), retentionPromptedAt: new Date() })
        .where(eq(schema.customers.id, customer.id))
        .catch(() => {}); // pre-migration-0003 databases
    }
    const files = form.getAll("pages").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "no_pages" }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: "too_many_pages", detail: `max ${MAX_FILES}` }, { status: 400 });

    const pages: BillPage[] = [];
    let total = 0;
    for (const file of files) {
      const data = Buffer.from(await file.arrayBuffer());
      total += data.length;
      if (total > MAX_TOTAL_BYTES) {
        return NextResponse.json({ error: "too_large", detail: "15 MB total maximum" }, { status: 413 });
      }
      pages.push({ data, mimeType: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg") });
    }

    // Stream progress as NDJSON: one {stage} line per pipeline phase, then a
    // final {summaryUrl,…} or {error,…} line. The client animates a real
    // progress bar from these instead of staring at a spinner for 2 minutes.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const started = Date.now();
        const send = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          } catch {
            // client disconnected — keep processing; the result is still stored
          }
        };
        const sendStage = (stage: string) => {
          console.log(`[upload] stage=${stage} t=${Math.round((Date.now() - started) / 1000)}s`);
          send({ stage });
        };
        try {
          const result = await runBillPipeline({
            customerId: customer.id,
            pages,
            locale,
            translate: form.get("translate") === "on",
            onProgress: sendStage,
          });
          send(result);
        } catch (err) {
          if (err instanceof PipelineError && err.code === "unsupported_category") {
            send({ error: "unsupported_category", detail: "We currently support energy, internet and mobile bills." });
          } else {
            console.error("[upload]", sanitize(err));
            send({ error: "pipeline_error", detail: sanitize(err) });
          }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[upload]", sanitize(err));
    return NextResponse.json({ error: "pipeline_error", detail: sanitize(err) }, { status: 500 });
  }
}

function sanitize(err: unknown): string {
  return (err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
    .slice(0, 300);
}

async function upsertWebCustomer(webId: string) {
  const { eq } = await import("drizzle-orm");
  const found = await db().select().from(schema.customers).where(eq(schema.customers.waId, webId)).limit(1);
  if (found[0]) return found[0];
  const [created] = await db()
    .insert(schema.customers)
    .values({ waId: webId, waHash: webId.slice(4), locale: "en" })
    .onConflictDoNothing({ target: schema.customers.waId })
    .returning();
  if (created) return created;
  const [existing] = await db().select().from(schema.customers).where(eq(schema.customers.waId, webId)).limit(1);
  return existing!;
}
