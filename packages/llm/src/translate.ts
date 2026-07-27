import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MergedExtraction } from "@bills/category-packs";
import { MODEL, anthropic, usageFrom, type LlmUsage } from "./client.js";

export const TRANSLATE_PROMPT_VERSION = "translate-v1";

/**
 * Bill-view translation with LQA: when the customer's language differs from
 * the bill's, translate the bill's own text (line-item labels, printed
 * instructions, printed discounts) so they can read their bill natively.
 *
 * LQA is deterministic code, not model self-review: numbers are invariant
 * under translation, so every digit sequence in a translated string must
 * exactly match its source, and array lengths must match. Any violating
 * item falls back to the original text — a wrong translation of a label is
 * annoying, a changed number is a lie.
 */

const TranslationSchema = z.object({
  lineItemLabels: z.array(z.string()),
  printedNextSteps: z.array(z.string()),
  discountLabels: z.array(z.string()),
});

export interface BillTranslation {
  language: string;
  lineItemLabels: string[];
  printedNextSteps: string[];
  discountLabels: string[];
  lqa: { checked: number; fellBack: number };
  usage: LlmUsage;
  promptVersion: string;
}

const digitRuns = (s: string): string => (s.match(/\d+/g) ?? []).sort().join("|");

/** Symbols that must survive translation untouched, with their counts. */
const INVARIANT_SYMBOLS = /[₪€$£¥₽%]/g;
const symbolCounts = (s: string): string =>
  (s.match(INVARIANT_SYMBOLS) ?? []).sort().join("");

/**
 * Script expected in the translation, for languages that don't share the
 * Latin alphabet. A model that echoes the source language back produces
 * perfect digits and perfect symbols — only a script check catches it.
 */
const TARGET_SCRIPT: Record<string, RegExp> = {
  he: /[\u0590-\u05FF]/,
  ru: /[\u0400-\u04FF]/,
  zh: /[\u4E00-\u9FFF\u3400-\u4DBF]/,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/,
  ar: /[\u0600-\u06FF]/,
  el: /[\u0370-\u03FF]/,
};

/**
 * A phrase worth script-checking: multiple words and real length. Single
 * tokens are brands or codes ("Vodafone", "5G") that legitimately pass
 * through a translation unchanged.
 */
const isPhrase = (s: string): boolean => {
  const words = s.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return words.length >= 2 && (s.match(/\p{L}/gu) ?? []).length >= 8;
};

/**
 * Merge translated strings over sources, falling back per item when LQA
 * fails. Checks, in order of severity:
 *  - array length mismatch → full fallback (alignment is unrecoverable)
 *  - empty translation of non-empty source
 *  - digit sequences changed (numbers are invariant under translation)
 *  - currency/percent symbols added, dropped or swapped
 *  - non-Latin target with no character of that script in a multi-word
 *    phrase (the model answered in the wrong language)
 */
export function lqaMerge(
  source: string[],
  translated: string[],
  targetLanguage?: string,
): { merged: string[]; fellBack: number } {
  if (translated.length !== source.length) return { merged: [...source], fellBack: source.length };
  const script = targetLanguage ? TARGET_SCRIPT[targetLanguage.toLowerCase().slice(0, 2)] : undefined;
  let fellBack = 0;
  const merged = source.map((src, i) => {
    const tr = translated[i]!.trim();
    const failed =
      (src.trim().length > 0 && tr.length === 0) ||
      digitRuns(tr) !== digitRuns(src) ||
      symbolCounts(tr) !== symbolCounts(src) ||
      (script !== undefined && isPhrase(src) && !script.test(tr));
    if (failed) {
      fellBack++;
      return src;
    }
    return tr;
  });
  return { merged, fellBack };
}

export async function translateBillView(args: {
  extraction: MergedExtraction;
  targetLanguage: string; // BCP-47 base tag, e.g. "en"
}): Promise<BillTranslation | null> {
  const { extraction, targetLanguage } = args;
  const common = extraction.common;
  const billLang = (common.billLanguage ?? "").toLowerCase().slice(0, 2);
  if (!billLang || billLang === targetLanguage.toLowerCase().slice(0, 2)) return null;

  const source = {
    lineItemLabels: common.lineItems.map((li) => li.label),
    printedNextSteps: common.printedNextSteps,
    discountLabels: common.printedDiscounts.map((d) => [d.label, d.condition].filter(Boolean).join(" — ")),
  };
  if (
    source.lineItemLabels.length === 0 &&
    source.printedNextSteps.length === 0 &&
    source.discountLabels.length === 0
  ) {
    return null;
  }

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: `You are a professional financial-document translator (LQA-grade). Translate consumer-bill text faithfully and naturally into the target language.

Hard rules:
1. Keep every number, unit, date, currency symbol and product/brand name EXACTLY as in the source — character for character.
2. Translate terminology the way a native utility/telecom bill would phrase it; expand local jargon into plain terms when a literal translation would be meaningless.
3. Return arrays of exactly the same length and order as the source arrays. Never merge, split, add or drop items.
4. If an item cannot be translated (proper noun, code), return it unchanged.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Target language: ${targetLanguage}\nSource language: ${billLang}\n\nSource JSON:\n${JSON.stringify(source, null, 2)}`,
      },
    ],
    output_config: { format: zodOutputFormat(TranslationSchema) },
  });

  const parsed = response.parsed_output as z.infer<typeof TranslationSchema> | null;
  if (!parsed) return null;

  const items = lqaMerge(source.lineItemLabels, parsed.lineItemLabels, targetLanguage);
  const steps = lqaMerge(source.printedNextSteps, parsed.printedNextSteps, targetLanguage);
  const discounts = lqaMerge(source.discountLabels, parsed.discountLabels, targetLanguage);

  return {
    language: targetLanguage,
    lineItemLabels: items.merged,
    printedNextSteps: steps.merged,
    discountLabels: discounts.merged,
    lqa: {
      checked: source.lineItemLabels.length + source.printedNextSteps.length + source.discountLabels.length,
      fellBack: items.fellBack + steps.fellBack + discounts.fellBack,
    },
    usage: usageFrom(response.usage),
    promptVersion: TRANSLATE_PROMPT_VERSION,
  };
}
