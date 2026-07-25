import { z } from "zod";
import type { CommonFields, ComparisonOffer, ComparisonSource } from "@bills/category-packs";
import { MODEL, anthropic } from "./client.js";

/**
 * Live market research: an Opus call with the server-side web-search tool
 * finds CURRENT competitor offers for the bill's category and country. Every
 * offer must carry the source URL it came from; anything unsourced is
 * refused by the prompt and dropped by validation. Results feed the same
 * ComparisonSource interface as curated data, so the guardrails treat them
 * identically: a switch saving is only claimable against a concrete offer.
 */

const WireOfferSchema = z.object({
  provider: z.string().min(1),
  name: z.string().min(1),
  /** integer, minor units of `currency` */
  estMonthlyCostMinor: z.number().int().positive(),
  currency: z.string().length(3),
  link: z.string().url(),
  validUntil: z.string().nullable(),
  notes: z.string().nullable(),
});

const WireOffersSchema = z.object({ offers: z.array(WireOfferSchema).max(8) });

export class WebSearchComparisonSource implements ComparisonSource {
  readonly id = "web-search";

  constructor(private readonly category: string) {}

  async getOffers(fields: unknown, common: CommonFields): Promise<ComparisonOffer[]> {
    const country = common.country?.toUpperCase();
    const currency = common.currency?.toUpperCase();
    if (!country || !currency) return [];

    const currentPlan = summarizeCurrent(this.category, fields, common);

    try {
      const response = await anthropic().messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
        system: [
          {
            type: "text",
            text: `You are a market researcher for consumer ${this.category} plans. You find CURRENT, real offers a customer could actually switch to.

Hard rules:
1. Use web search (up to 3 searches) for current offers in the customer's country. Prefer provider websites and reputable comparison sites.
2. Report ONLY offers you actually found, each with the URL of the page where you saw the price. Never invent providers, plans, or prices. If you cannot find reliable current prices, return an empty list.
3. estMonthlyCostMinor is the realistic ONGOING monthly cost in integer minor units of the customer's currency (e.g. cents). If there's an intro promo, use the ongoing price and mention the promo in notes.
4. Only offers that plausibly match or beat the customer's current service level.
5. After searching, respond with ONLY a JSON object (no prose): {"offers": [{"provider": string, "name": string, "estMonthlyCostMinor": integer, "currency": "${currency}", "link": string(url), "validUntil": string|null, "notes": string|null}]}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `Country: ${country}. Currency: ${currency}. Category: ${this.category}.\nCustomer's current service:\n${currentPlan}\n\nFind up to 5 better offers.`,
          },
        ],
      });

      const text = response.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end <= start) return [];
      const parsed = WireOffersSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
      if (!parsed.success) return [];

      return parsed.data.offers
        .filter((o) => o.currency === currency)
        .slice(0, 5)
        .map((o, i) => ({
          id: `web-${this.category}-${i}`,
          provider: o.provider,
          name: o.name,
          estMonthlyCostMinor: o.estMonthlyCostMinor,
          currency: o.currency,
          country,
          link: o.link,
          validUntil: o.validUntil ?? undefined,
          notes: o.notes ?? undefined,
        }));
    } catch (err) {
      console.error("[comparison-search] failed:", err instanceof Error ? err.message.slice(0, 200) : err);
      return []; // comparison is best-effort; optimize-current levers still work
    }
  }
}

function summarizeCurrent(category: string, fields: unknown, common: CommonFields): string {
  const f = (fields ?? {}) as Record<string, unknown>;
  const lines: string[] = [
    `Provider: ${common.providerName ?? "unknown"}`,
    `Bill total this cycle: ${common.totalAmount ?? "unknown"} ${common.currency ?? ""}`,
  ];
  if (category === "mobile") {
    lines.push(`Plan: ${f.planName ?? "unknown"}, base fee: ${f.baseFee ?? "unknown"}`);
  } else if (category === "broadband") {
    lines.push(`Plan: ${f.planName ?? "unknown"}, speed: ${f.speedTier ?? "unknown"}, monthly: ${f.monthlyPrice ?? "unknown"}, out-of-contract: ${f.outOfContractPrice ?? "n/a"}`);
  } else if (category === "energy") {
    lines.push(`Tariff: ${f.tariffName ?? "unknown"}, usage: ${f.usageKwh ?? "?"} kWh`);
    const rates = Array.isArray(f.unitRates) ? (f.unitRates as Array<Record<string, unknown>>) : [];
    for (const r of rates.slice(0, 3)) lines.push(`Rate: ${r.ratePerUnit ?? "?"}/${r.unit ?? "?"} (${r.band ?? "single"})`);
  }
  return lines.join("\n");
}
