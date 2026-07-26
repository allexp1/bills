import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, schema } from "@bills/db";
import type { BillPage } from "@bills/llm";
import { resolveLocale, ulid, waHash, type SupportedLocale } from "@bills/shared";
import { env } from "../../../../server/env.js";
import { PipelineError, runBillPipeline } from "../../../../server/run-bill-pipeline.js";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Dev/test harness: identical pipeline to the public upload, but gated by
 * DEV_TRY_SECRET and exempt from quotas — for smoke tests and demos.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.DEV_TRY_SECRET;
    if (!secret) return new NextResponse("harness disabled (DEV_TRY_SECRET unset)", { status: 404 });
    const form = await req.formData();
    const provided = String(form.get("secret") ?? "");
    const a = createHash("sha256").update(provided).digest();
    const b = createHash("sha256").update(secret).digest();
    if (!timingSafeEqual(a, b)) return new NextResponse("wrong secret", { status: 401 });

    const locale = resolveLocale(String(form.get("locale") ?? "en")) as SupportedLocale;
    const files = form.getAll("pages").filter((f): f is File => f instanceof File);
    if (files.length === 0) return new NextResponse("no pages uploaded", { status: 400 });
    if (files.length > 10) return new NextResponse("max 10 pages", { status: 400 });

    const pages: BillPage[] = [];
    for (const file of files) {
      pages.push({
        data: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      });
    }

    const tryId = `try:${ulid()}`;
    const [customer] = await db()
      .insert(schema.customers)
      .values({ waId: tryId, waHash: waHash(tryId, env.waHashPepper), locale })
      .returning();

    const result = await runBillPipeline({
      customerId: customer!.id,
      pages,
      locale,
      translate: form.get("translate") === "on",
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PipelineError && err.code === "unsupported_category") {
      return NextResponse.json({ error: "unsupported_category" }, { status: 422 });
    }
    const detail = (err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]")
      .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
      .slice(0, 300);
    console.error("[dev/process]", detail);
    return NextResponse.json({ error: "pipeline_error", detail, hint: "GET /api/dev/diag?secret=… for a full check" }, { status: 500 });
  }
}
