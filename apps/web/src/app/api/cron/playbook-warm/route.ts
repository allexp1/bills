import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "../../../../server/playbook-queue.js";

export const runtime = "nodejs";
/** Each market is a multi-search research pass; give it Fluid-compute headroom. */
export const maxDuration = 800;

/**
 * Vercel Cron: drain the market-research queue a few markets at a time.
 *
 * Warming happens here rather than on the customer's request path so that the
 * first bill from a new market is a database read instead of a two-minute
 * wait. Deliberately slow: every row is a real research call with real cost,
 * so the queue trickles rather than stampedes.
 *
 * Configured in vercel.json; protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  // One per run, every 15 minutes. A research pass takes 7-10 minutes and the
  // function dies at 800s, so a second one in the same run gets killed
  // mid-call — billed and discarded. More frequent runs beat bigger ones.
  const perRun = Number(process.env.PLAYBOOK_WARM_PER_RUN ?? 1);
  const result = await drainQueue({ limit: perRun });
  console.log(
    `[playbook-warm] researched ${result.researched}, failed ${result.failed}, ${result.remaining} still queued`,
  );
  return NextResponse.json(result);
}
