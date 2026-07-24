import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CategoryPack, ComparisonOffer, MergedExtraction } from "@bills/category-packs";
import type { CommonFields } from "@bills/category-packs";
import type { SupportedLocale } from "@bills/shared";
import { MODEL, anthropic, usageFrom, type LlmUsage } from "./client.js";

export const DECODE_PROMPT_VERSION = "decode-v1";

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
7. Keep the headline to one sentence a stressed person skims. Keep sections short; put depth into explainMoreQueue.`;
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
