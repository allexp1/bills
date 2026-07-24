import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { registerJobHandlers } from "../../../../server/handlers/register.js";
import { runJob, type JobName } from "../../../../server/jobs.js";

export const runtime = "nodejs";
/** Bill processing runs 30–60s of Opus calls; needs Fluid compute / a paid plan. */
export const maxDuration = 300;

const JOB_NAMES: ReadonlySet<string> = new Set(["ingest-media", "process-bill"]);

/** QStash callback endpoint: one dynamic route per job name, signature-verified. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  registerJobHandlers();
  const { job } = await ctx.params;
  if (!JOB_NAMES.has(job)) return new NextResponse("unknown job", { status: 404 });

  const body = await req.text();

  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (currentKey && nextKey) {
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    const signature = req.headers.get("upstash-signature") ?? "";
    const ok = await receiver.verify({ signature, body }).catch(() => false);
    if (!ok) return new NextResponse("bad signature", { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return new NextResponse("QStash signing keys not configured", { status: 500 });
  }

  try {
    await runJob(job as JobName, JSON.parse(body));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[jobs/${job}]`, err instanceof Error ? err.message : err);
    return new NextResponse("job failed", { status: 500 }); // non-2xx → QStash retries
  }
}
