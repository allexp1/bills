import { NextRequest, NextResponse } from "next/server";
import { parseWebhookPayload, verifyMetaSignature, verifySubscription } from "@bills/channel";
import { redactForLog } from "@bills/shared";
import { env } from "../../../../server/env.js";
import { handleInbound } from "../../../../server/inbound.js";
import { registerJobHandlers } from "../../../../server/handlers/register.js";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Meta webhook verification handshake. */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const challenge = verifySubscription(
    {
      "hub.mode": q.get("hub.mode") ?? undefined,
      "hub.verify_token": q.get("hub.verify_token") ?? undefined,
      "hub.challenge": q.get("hub.challenge") ?? undefined,
    },
    env.whatsappVerifyToken,
  );
  if (challenge === null) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

/**
 * Inbound messages. HMAC-verified on the RAW body, events processed with
 * per-message idempotency, always a fast 200 (Meta retries/disables slow or
 * erroring webhooks — real failures are our problem, not Meta's).
 */
export async function POST(req: NextRequest) {
  registerJobHandlers();
  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(raw, signature, env.whatsappAppSecret)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  const events = parseWebhookPayload(payload);
  for (const event of events) {
    try {
      await handleInbound(event);
    } catch (err) {
      // Log (redacted) and keep going — one bad event must not 500 the batch.
      console.error("[webhook] event failed", redactForLog({ kind: event.kind, err: String(err) }));
    }
  }
  return new NextResponse("ok", { status: 200 });
}
