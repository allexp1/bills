import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CategoryPack, ComparisonOffer, MergedExtraction } from "@bills/category-packs";
import type { CommonFields } from "@bills/category-packs";
import type { SupportedLocale } from "@bills/shared";
import { MODEL, anthropic, usageFrom, type LlmUsage } from "./client.js";

export const DECODE_PROMPT_VERSION = "decode-v2";

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
  /** Ready to send as-is via WhatsApp/SMS/chat. Keep under ~600 chars. */
  chatMessage: z.string(),
  callScript: z.object({
    opening: z.string(),
    ask: z.string(),
    evidence: z.array(z.string()),
    objections: z.array(z.object({ ifTheySay: z.string(), youSay: z.string() })).max(3),
    closing: z.string(),
  }),
  /** The monthly price to ask for, integer minor units; null if ungroundable. */
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

Negotiation pitch (negotiationPitch):
8. When there is a real negotiable opportunity (any available lever applies), also produce a pitch the CUSTOMER can send or say to their CURRENT provider to get a better price. If nothing is genuinely negotiable, set negotiationPitch to null.
9. Strategy: a cheaper comparable offer exists → "competitor_anchor" (name the competitor, plan and its monthly price from comparisonOffers); paying for add-ons/capacity they don't use → "plan_fit"; contract ending or an out-of-contract price jump → "loyalty_retention".
10. Write chatMessage and every callScript field in the BILL's language (extraction.common.billLanguage; fall back to the customer's locale) — a local support agent will read it. First person, as the customer. Polite, firm, specific: state how long they've been a customer if visible, name the exact target price, and ask for the retention/loyalty team if the first answer is no.
11. chatMessage must stand alone, under 600 characters, and end with a concrete question. The callScript is for reading aloud on a phone call: short spoken sentences; evidence lines each cite one bill fact or one competitor offer; at most 3 objections with realistic agent pushback.
12. Pitch grounding is rule 3 applied twice: every amount in the pitch must trace to basis.extractionPaths or a basis.comparisonOfferIds entry, and targetMonthlyMinor must equal a cited offer's price or a defensible bill-derived figure — otherwise leave it null and ask without a number. NEVER put account numbers, ID numbers or payment details in the pitch; "my account" suffices, the provider sees who is writing.`;
}

export async function decodeBill(args: {
  extraction: MergedExtraction;
  pack: CategoryPack<any>;
  gotchaFacts: Record<string, boolean | null>;
  offers: ComparisonOffer[];
  customerLocale: SupportedLocale;
}): Promise<DecodeResult> {
  const { extraction, pack, gotchaFacts, offers, customerLocale } = args;
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
