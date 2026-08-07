import { NextRequest, NextResponse } from "next/server";
import { gte } from "drizzle-orm";
import { db, schema } from "@bills/db";
import { resolveLocale, waHash, type SupportedLocale } from "@bills/shared";
import { isOverloaded, type BillPage } from "@bills/llm";

/**
 * Browsers are unreliable about file.type — an .xlsx dragged from some mail
 * clients arrives with an empty type — so the extension is the fallback.
 * Spreadsheets matter here because Har haBituach, the Israeli insurance
 * registry, exports Excel as its primary format.
 */
function mimeTypeFor(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".csv")) return "text/csv";
  return "image/jpeg";
}
import { auth, currentUser } from "@clerk/nextjs/server";
import { clerkEnabled } from "../../../lib/clerk-enabled.js";
import { resolveCustomer } from "../../../server/auth/resolve-customer.js";
import { env } from "../../../server/env.js";
import { billQuotaExceeded } from "../../../server/rate-limit.js";
import { PipelineError } from "../../../server/run-bill-pipeline.js";
import { runBillUpload } from "../../../server/run-bill-upload.js";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * Shown for a 429 or 529. Says whose problem it is, because the raw body did
 * the opposite: a person reading "529 overloaded_error" next to their own
 * upload reasonably concludes their bill broke something.
 */
const OVERLOADED_DETAIL =
  "The analysis service is busy right now, not your bill. Nothing has been charged. Wait a minute and try again.";

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const GLOBAL_BILLS_PER_DAY = Number(process.env.GLOBAL_BILLS_PER_DAY ?? 200);

/**
 * Bill upload, with or without an account.
 *
 * Signed in, the bill is filed against the customer row behind the session, so
 * it appears in the portfolio. Signed out, it falls back to a pseudonymous
 * customer keyed on a hash of the client IP, which is how this endpoint worked
 * before accounts existed and is still how anonymous uploads are rate limited.
 * No raw IP is stored; the hash is the same pseudonym scheme used for WhatsApp
 * numbers.
 *
 * Before this, every web upload went to the IP identity even for signed-in
 * visitors, so bills uploaded from the site could never appear in the uploader
 * own portfolio. The page looked broken and the data was simply filed
 * elsewhere.
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

    const customer = await customerForRequest(req);
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
      pages.push({ data, mimeType: mimeTypeFor(file) });
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
        try {
          const result = await runBillUpload({
            customerId: customer.id,
            pages,
            locale,
            translate: form.get("translate") === "on",
            /* Set only by the "Analyse it again" action, after the person has
               been told this is a bill they already have. Nothing sends it on
               a first attempt, so a normal upload can never skip the check. */
            force: form.get("force") === "on",
            onProgress: (p) => {
              console.log(
                `[upload] stage=${p.stage}${p.of && p.of > 1 ? ` bill=${p.bill}/${p.of}` : ""} t=${Math.round((Date.now() - started) / 1000)}s`,
              );
              send(p);
            },
          });

          /* One bill keeps the old response shape exactly, so nothing that
             already reads summaryUrl has to change: the client, the /try
             harness and anything anyone has scripted against it. Several bills
             get the list, which only the new client asks for. */
          if (result.billCount === 1 && result.bills[0] && result.failures.length === 0) {
            send(result.bills[0].outcome);
          } else if (result.bills.length === 0) {
            const first = result.failures[0];
            send(
              first?.error === "unsupported_category"
                ? { error: "unsupported_category", detail: "We currently support energy, internet and mobile bills." }
                : first?.error === "overloaded"
                  ? { error: "overloaded", detail: OVERLOADED_DETAIL }
                  : { error: "pipeline_error", detail: first?.detail ?? "the bill could not be read" },
            );
          } else {
            send({
              billCount: result.billCount,
              bills: result.bills.map((b) => ({ index: b.index, ...b.outcome })),
              failures: result.failures,
            });
          }
        } catch (err) {
          if (err instanceof PipelineError && err.code === "unsupported_category") {
            send({ error: "unsupported_category", detail: "We currently support energy, internet and mobile bills." });
          } else if ((err instanceof PipelineError && err.code === "overloaded") || isOverloaded(err)) {
            /* Not a raw 529 body. That is what shipped, and "529 {"type":
               "error"...}" tells the person nothing they can act on, while
               implying their bill was the problem. */
            console.warn("[upload] overloaded");
            send({ error: "overloaded", detail: OVERLOADED_DETAIL });
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

/**
 * The account's customer row when signed in, otherwise the pseudonymous
 * per-IP one. Falling back rather than refusing keeps the anonymous upload
 * path working, which is the one most visitors use.
 */
async function customerForRequest(req: NextRequest) {
  if (clerkEnabled) {
    try {
      const { userId } = await auth();
      if (userId) {
        const user = await currentUser();
        const { customerId } = await resolveCustomer({
          userId,
          verifiedPhone:
            user?.phoneNumbers.find((p) => p.verification?.status === "verified")?.phoneNumber ??
            null,
          verifiedEmail:
            user?.emailAddresses.find((e) => e.verification?.status === "verified")?.emailAddress ??
            null,
          displayName: user?.firstName ?? null,
          locale: "en",
        });
        const { eq } = await import("drizzle-orm");
        const rows = await db()
          .select()
          .from(schema.customers)
          .where(eq(schema.customers.id, customerId))
          .limit(1);
        if (rows[0]) return rows[0];
      }
    } catch {
      /* A session problem must not block an upload. Fall through to anonymous. */
    }
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "0.0.0.0").split(",")[0]!.trim();
  return upsertWebCustomer(`web:${waHash(ip, env.waHashPepper)}`);
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
