import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../../../../server/env.js";

export const runtime = "nodejs";

/**
 * One-time self-configuration: registers this deployment's Telegram webhook
 * (with the secret_token) from inside Vercel, where api.telegram.org is
 * reachable. Gated by DEV_TRY_SECRET. Safe to re-run; GET shows status.
 */
export async function GET(req: NextRequest) {
  const gate = process.env.DEV_TRY_SECRET;
  const provided = req.nextUrl.searchParams.get("secret") ?? "";
  if (!gate) return new NextResponse("disabled", { status: 404 });
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(gate).digest();
  if (!timingSafeEqual(a, b)) return new NextResponse("wrong secret", { status: 401 });

  const base = `https://api.telegram.org/bot${env.telegramBotToken}`;
  const webhookUrl = `${env.appBaseUrl}/api/telegram/webhook`;

  if (req.nextUrl.searchParams.get("action") === "set") {
    const res = await fetch(`${base}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: env.telegramWebhookSecret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    });
    const result = await res.json().catch(() => null);
    return NextResponse.json({ action: "setWebhook", webhookUrl, result });
  }

  const info = await fetch(`${base}/getWebhookInfo`).then((r) => r.json()).catch(() => null);
  const me = await fetch(`${base}/getMe`).then((r) => r.json()).catch(() => null);
  return NextResponse.json({
    bot: me?.result?.username ?? null,
    webhook: info?.result ?? null,
    hint: "add &action=set to register the webhook",
  });
}
