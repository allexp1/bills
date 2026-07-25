import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CategoryPack, ComparisonOffer, MergedExtraction } from "@bills/category-packs";
import type { CommonFields } from "@bills/category-packs";
import type { SupportedLocale } from "@bills/shared";
import { MODEL, anthropic, usageFrom, type LlmUsage } from "./client.js";

export const DECODE_PROMPT_VERSION = "decode-v5";

export const SavingsClaimSchema = z.object({
  leverId: z.string(),
  estimatedSavingMinor: z.number().int(),
  period: z.enum(["monthly", "annual", "one_off"]),
  currency: z.string(),
  basis: z.object({
    extractionPaths: z.array(z.string()),
    formula: z.string().nullable(),
    comparisonOfferId: z.string().nullable(),
  }),
  explanation: z.string(),
});

export const NegotiationPitchSchema = z.object({
  /** The BILL's language — this text goes to the provider's local support. */
  language: z.string(),
  strategy: z.enum(["competitor_anchor", "plan_fit", "loyalty_retention"]),
  /**
   * Ready to send as-is via WhatsApp/SMS/chat. Keep under ~600 chars.
   * Ends with an OPEN question ("what options do you have for someone like
   * me?") — never a self-named target price.
   */
  chatMessage: z.string(),
  callScript: z.object({
    /** Rapport + identity (tenure, on-time payment) + specific problem statement. */
    opening: z.string(),
    /** The open extraction ask — NO numbers; makes the rep reveal the offer menu. */
    openAsk: z.string(),
    /** What to say the moment they make their first offer (thank + "is that the best you can do?" + silence). */
    onFirstOffer: z.string(),
    /** Tier-pushing lines in order: mirror/label, "what else can you do?", escalate to retention. */
    pushHarder: z.array(z.string()).max(4),
    /** Objective anchors ONLY: competitor offers and the provider's own new-customer price, each groundable. */
    evidence: z.array(z.string()),
    objections: z.array(z.object({ ifTheySay: z.string(), youSay: z.string() })).max(3),
    /** Lock the deal: restate terms, confirmation number, note the promo end date. */
    closing: z.string(),
  }),
  /**
   * The customer's PRIVATE goal (integer minor units) — shown to the customer
   * as "your number, don't say it first", judged against offers; NEVER
   * written into chatMessage/openAsk. Null if ungroundable.
   */
  targetMonthlyMinor: z.number().int().nullable(),
  basis: z.object({
    extractionPaths: z.array(z.string()),
    comparisonOfferIds: z.array(z.string()),
  }),
});
export type NegotiationPitch = z.infer<typeof NegotiationPitchSchema>;

export const DecodeOutputSchema = z.object({
  language: z.string(),
  headline: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      plainExplanation: z.string(),
      sourceExtractionPaths: z.array(z.string()),
    }),
  ),
  gotchas: z.array(
    z.object({
      checkId: z.string(),
      severity: z.enum(["info", "warn", "alert"]),
      explanation: z.string(),
      sourceExtractionPaths: z.array(z.string()),
    }),
  ),
  printedNextSteps: z.array(z.string()),
  savings: z.array(SavingsClaimSchema),
  /** Deeper explanations held back for the "Explain more" button. */
  explainMoreQueue: z.array(z.string()),
  /** Provider-facing negotiation pitch; null when nothing is negotiable. */
  negotiationPitch: NegotiationPitchSchema.nullable(),
});
export type DecodeOutput = z.infer<typeof DecodeOutputSchema>;

export interface DecodeResult {
  decode: DecodeOutput;
  usage: LlmUsage;
  model: string;
  promptVersion: string;
}

function decodeSystemPrompt(): string {
  return `You are a consumer-bill translator and savings advisor. You receive structured data extracted from a bill (never the bill itself) plus category guidance, and produce a plain-language decode for the customer.

Hard rules:
1. Write EVERYTHING in the customer's language (given below). Format amounts in the bill's currency using the customer's locale conventions.
2. No jargon left undecoded — every technical term gets a plain explanation.
3. GROUNDING: every number you write must cite its source. Savings claims must reference extractionPaths (dotted paths into the extraction JSON) and/or a comparisonOfferId. If you cannot ground a number, describe the opportunity WITHOUT a figure. Fabricating numbers is the one unforgivable failure.
4. Savings may only instantiate the levers listed below — use the exact leverId. Amounts in integer minor units.
5. Use the pre-computed gotcha facts as truth; do not re-derive or contradict them.
6. End the summary thinking with: what the customer actually pays this cycle, and why.
7. Keep the headline to one sentence a stressed person skims. Keep sections short; put depth into explainMoreQueue.

Negotiation pitch (negotiationPitch) — follow the evidence-based method below; it is not optional style advice:
8. When there is a real negotiable opportunity (any available lever applies), produce a pitch the CUSTOMER can send or say to their CURRENT provider. If nothing is genuinely negotiable, set negotiationPitch to null.
9. Strategy: usage data shows the customer uses far less than they pay for (oversized plan, unused add-ons) → "plan_fit" — this beats haggling: the fix is a smaller tier, and the evidence is the provider's own data about the customer. A cheaper genuinely-comparable offer exists → "competitor_anchor". Contract ending or an out-of-contract price jump → "loyalty_retention".
10. Language: chatMessage and every callScript field in the BILL's language (extraction.common.billLanguage; fall back to customer locale) — a local support agent reads it. First person, as the customer. Calm, warm, specific.
11. NEVER NAME THE CUSTOMER'S PRICE. Retention reps work from a tiered discount menu the customer cannot see; naming a number caps the outcome at that number and reveals the walk-away point (information-asymmetry anchoring: the first-offer advantage inverts against an expert counterpart). So: chatMessage and openAsk contain NO price demand — they state tenure + the specific problem and end with an OPEN extraction question ("What options do you have for someone like me?" / "How am I supposed to make this work?"). targetMonthlyMinor is the customer's PRIVATE yardstick for judging offers, never text.
12. Number discipline, by placement:
   - chatMessage and callScript.opening may contain ONLY the customer's own bill facts: what they pay, and above all their USAGE ("I use 100 GB of my 800 GB plan"). Utilization is the strongest evidence in existence here — it is the provider's own data about this customer and cannot be argued with. NO competitor prices in the opening or chat message: they are ammunition, held back.
   - Competitor prices appear ONLY in callScript.evidence (deployed after their first offer) and objection responses — and ONLY when the cited offer's known conditions actually cover this customer's real needs (allowance comfortably above actual usage, comparable speed). Never compare against an offer whose conditions you can't verify from the data; a mismatched comparison hands the rep an easy rebuttal. Each evidence line states the matching condition: "200 GB — double what I actually use — for X at [competitor]".
   - The provider's own advertised/new-customer price, if present in the data, is the one external number safe to use anywhere: it is their own standard.
13. callScript is a negotiation sequence, in order:
   - opening: rapport + identity ("customer for N years, always on time" — only if visible in the data) + the specific problem with exact bill figures.
   - openAsk: the open extraction question. Zero numbers here.
   - onFirstOffer: thank them, then "Is that the best you can do?" — and explicitly instruct the customer to stay silent after asking; people fill silence with concessions. Never accept the first offer.
   - pushHarder (2-4 lines, escalating): a mirror/label ("The best you're showing? It seems like there might be loyalty promos not on my account…"), "What else can you do?", a no-oriented ask ("Would it be unreasonable to ask for what new customers pay?"), and finally the calm escalation: "Could you connect me with the retention team?" — retention/loyalty reps are scored on saves and hold the deepest discount tier. Mention cancelling ONLY when the data shows a genuinely switchable alternative (a cited competitor offer); reps call bluffs and may process the cancellation.
   - evidence: the objective anchors from rule 12, one per line, deployed mid-call — not in the opening.
   - objections: realistic rep pushback ("that promo is for new customers only", "this offer expires with this call") with responses; treat "today only" as pressure, not truth — retention offers regenerate.
   - closing: accept only against the private target; restate the agreed terms, ask for a confirmation number, note when any promo ends.
14. Pitch grounding is rule 3 applied twice: every amount must trace to basis.extractionPaths or a basis.comparisonOfferIds entry; targetMonthlyMinor must equal a cited offer's price or a defensible bill-derived figure — else null. NEVER put account numbers, ID numbers or payment details in the pitch; "my account" suffices, the provider sees who is writing.
15. Category nuance: retention haggling works best for telecom/broadband/mobile. For energy bills in markets with regulated/published tariffs (notably the UK), suppliers cannot price-match or deviate — frame the pitch around switching or moving to the provider's best published tariff instead of asking for an off-menu discount.
16. Prior-bill history: when priorBills is present in the context, explain the biggest month-over-month changes (total delta, charges that appeared/disappeared/changed, usage shifts) — those amounts are the customer's own history and fully citable anywhere, including the pitch ("my bill went from X to Y"). A price creep across months is loyalty_retention ammunition.`;
}

export interface PriorBillSummary {
  period: string | null;
  totalAsPrinted: string | null;
  lineItems: Array<{ label: string; amount: string | null }>;
}

export async function decodeBill(args: {
  extraction: MergedExtraction;
  pack: CategoryPack<any>;
  gotchaFacts: Record<string, boolean | null>;
  offers: ComparisonOffer[];
  customerLocale: SupportedLocale;
  /** The customer's prior bills (same provider+category), oldest first. */
  priorBills?: PriorBillSummary[];
}): Promise<DecodeResult> {
  const { extraction, pack, gotchaFacts, offers, customerLocale, priorBills } = args;
  const fields = (extraction.category_fields as Record<string, unknown>)[pack.id];
  const common = extraction.common as CommonFields;

  const applicableLevers = pack.savingsLevers.filter((lever) => {
    const a = lever.applies?.(fields as never, common);
    return a === undefined || a === true || a === null;
  });

  const context = {
    customerLocale,
    extraction,
    categoryGuidance: {
      glossary: pack.decodeHints.lineItemGlossary,
      gotchaChecks: pack.decodeHints.gotchaChecks.map((g) => ({ id: g.id, instruction: g.promptFragment })),
      confirmedGotchaFacts: gotchaFacts,
      availableLevers: applicableLevers.map((l) => ({ id: l.id, kind: l.kind, instruction: l.promptFragment })),
    },
    comparisonOffers: offers,
    ...(priorBills && priorBills.length > 0 ? { priorBills } : {}),
  };

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: decodeSystemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Customer locale: ${customerLocale}\n\nContext JSON:\n${JSON.stringify(context, null, 2)}`,
      },
    ],
    output_config: { format: zodOutputFormat(DecodeOutputSchema) },
  });

  const decode = response.parsed_output as DecodeOutput | null;
  if (!decode) throw new Error(`decode parse failed (stop_reason=${response.stop_reason})`);
  return { decode, usage: usageFrom(response.usage), model: MODEL, promptVersion: DECODE_PROMPT_VERSION };
}
