import { NextRequest, NextResponse } from "next/server";
import { callbackQueryId, parseTelegramUpdate } from "@bills/channel";
import { redactForLog } from "@bills/shared";
import { env } from "../../../../server/env.js";
import { handleInbound } from "../../../../server/inbound.js";
import { registerJobHandlers } from "../../../../server/handlers/register.js";
import { telegram } from "../../../../server/wiring.js";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Telegram webhook: verified via the secret_token header set at setWebhook
 * time; updates map to the same channel-agnostic InboundEvent the WhatsApp
 * webhook produces, and the shared pipeline does the rest. Always a fast
 * 200 — Telegram retries erroring webhooks aggressively.
 */
export async function POST(req: NextRequest) {
  registerJobHandlers();
  if (req.headers.get("x-telegram-bot-api-secret-token") !== env.telegramWebhookSecret) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  // Clear the inline-button spinner immediately, before any processing.
  const cbId = callbackQueryId(update);
  if (cbId) await telegram().answerCallback(cbId);

  for (const event of parseTelegramUpdate(update)) {
    try {
      await handleInbound(event);
    } catch (err) {
      console.error("[telegram-webhook] event failed", redactForLog({ kind: event.kind, err: String(err) }));
    }
  }
  return new NextResponse("ok", { status: 200 });
}
