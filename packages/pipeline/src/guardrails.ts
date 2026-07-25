import {
  pathHasValue,
  resolvePath,
  type CategoryPack,
  type CommonFields,
  type ComparisonOffer,
  type LeverVerdict,
  type MergedExtraction,
} from "@bills/category-packs";
import type { DecodeOutput, NegotiationPitch } from "@bills/llm";
import { parseAmount, redactRestrictedData, withinTolerance } from "@bills/shared";

/**
 * The trust boundary: pure-code verification that every number the decode
 * model produced is derivable from extracted (or comparison) data. No LLM
 * involvement — fabricated numbers do not survive this pass.
 */

export interface GuardedSaving {
  leverId: string;
  kind: "optimize_current" | "switch_provider";
  verdict: LeverVerdict["verdict"];
  /** null when the number was stripped (flagged lever). */
  amountMinor: number | null;
  period: "monthly" | "annual" | "one_off";
  currency: string;
  explanation: string;
  nextStep: string;
  /** The concrete market offer this saving is computed against, with source. */
  offer?: { provider: string; name: string; link?: string; estMonthlyCostMinor: number };
}

export interface GuardedPitch {
  strategy: NegotiationPitch["strategy"];
  /** Ready-to-send provider message, swept and redacted. */
  chatMessage: string;
  callScript: {
    opening: string;
    /** Open extraction ask — code-enforced to carry no currency amounts. */
    openAsk: string;
    onFirstOffer: string;
    pushHarder: string[];
    evidence: string[];
    objections: Array<{ ifTheySay: string; youSay: string }>;
    closing: string;
  };
  /**
   * The customer's PRIVATE goal (minor units) — for judging offers, never
   * said first. Null when the model's figure didn't ground.
   */
  targetMonthlyMinor: number | null;
  currency: string;
}

export interface GuardedDecode {
  language: string;
  headline: string;
  sections: DecodeOutput["sections"];
  gotchas: DecodeOutput["gotchas"];
  printedNextSteps: string[];
  savings: GuardedSaving[];
  explainMoreQueue: string[];
  /** Negotiation pitch to the current provider, post-sweep; absent when dropped or not generated. */
  pitch?: GuardedPitch;
  /**
   * The bill's provider's official support-chat channel, when the curated
   * directory has a source-confirmed one. whatsapp/sms render as deep links
   * with a ready-to-send message; web_chat is a plain link to the provider's
   * official chat page.
   */
  providerChat?: {
    providerName: string;
    channel: "whatsapp" | "sms" | "web_chat";
    waNumber?: string;
    smsNumber?: string;
    smsBody?: string;
    chatUrl?: string;
    source: string;
  };
  /** @deprecated pre-channel shape; still present on older stored decodes. */
  providerWa?: { providerName: string; waNumber: string; source: string };
}

export interface GuardrailReport {
  claims: Array<{ leverId: string; verdict: LeverVerdict["verdict"]; reason?: string; claimedMinor: number; finalMinor: number | null }>;
  removedSentences: Array<{ where: string; sentence: string }>;
  droppedCount: number;
}

/** Currency-amount tokens: "89,10", "1.234,56 €", "€45.00", "EUR 12,50". */
const AMOUNT_TOKEN =
  /(?:€|\$|£|EUR|USD|GBP)\s?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,3})?|\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}\s?(?:€|\$|£|EUR|USD|GBP)?/g;

function tokenToMinor(token: string, currency: string): number | null {
  return parseAmount(token, currency);
}

/** Collect every parseable amount present anywhere in the extraction JSON. */
function extractionAmountSet(extraction: MergedExtraction, currency: string): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (/\d/.test(v) && v.length <= 24) {
        const minor = parseAmount(v, currency);
        if (minor !== null) out.add(minor);
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(extraction.common);
  walk(extraction.category_fields);
  return out;
}

/**
 * Candidate derivable values: base set + pairwise sums/differences + common
 * period conversions (×12 annualization, ÷12 monthlyization) — the decode
 * legitimately writes "that's X per year" for a monthly amount.
 */
function derivableSet(base: Set<number>, extra: number[]): Set<number> {
  const values = [...base, ...extra];
  const out = new Set<number>(values);
  for (const v of values) {
    out.add(v * 12);
    out.add(Math.round(v / 12));
  }
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      out.add(values[i]! + values[j]!);
      out.add(Math.abs(values[i]! - values[j]!));
    }
  }
  return out;
}

function sweepText(
  text: string,
  derivable: Set<number>,
  currency: string,
  where: string,
  report: GuardrailReport,
): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => {
    const tokens = sentence.match(AMOUNT_TOKEN) ?? [];
    for (const token of tokens) {
      const minor = tokenToMinor(token, currency);
      if (minor !== null && minor !== 0 && !derivable.has(minor)) {
        report.removedSentences.push({ where, sentence });
        return false;
      }
    }
    return true;
  });
  return kept.join(" ");
}

export function applyGuardrails(args: {
  decode: DecodeOutput;
  extraction: MergedExtraction;
  pack: CategoryPack<any>;
  offers: ComparisonOffer[];
  locale: import("@bills/shared").SupportedLocale;
}): { guarded: GuardedDecode; report: GuardrailReport } {
  const { decode, extraction, pack, offers, locale } = args;
  const currency = extraction.common.currency ?? "EUR";
  const common = extraction.common as CommonFields;
  const fields = (extraction.category_fields as Record<string, unknown>)[pack.id];

  const report: GuardrailReport = { claims: [], removedSentences: [], droppedCount: 0 };
  const savings: GuardedSaving[] = [];
  const acceptedAmounts: number[] = [];

  for (const claim of decode.savings) {
    const lever = pack.savingsLevers.find((l) => l.id === claim.leverId);
    if (!lever) {
      report.claims.push({ leverId: claim.leverId, verdict: "dropped", reason: "unknown lever", claimedMinor: claim.estimatedSavingMinor, finalMinor: null });
      report.droppedCount++;
      continue;
    }
    // Cited extraction paths must exist and be non-null.
    const badPath = claim.basis.extractionPaths.find((p) => !pathHasValue(extraction, p));
    if (badPath && !claim.basis.comparisonOfferId) {
      report.claims.push({ leverId: claim.leverId, verdict: "dropped", reason: `cited path missing: ${badPath}`, claimedMinor: claim.estimatedSavingMinor, finalMinor: null });
      report.droppedCount++;
      continue;
    }

    const normalizedClaim = {
      ...claim,
      basis: {
        extractionPaths: claim.basis.extractionPaths,
        formula: claim.basis.formula ?? undefined,
        comparisonOfferId: claim.basis.comparisonOfferId ?? undefined,
      },
    };
    const verdict = lever.validate(normalizedClaim, fields as never, common, offers);
    const finalMinor =
      verdict.verdict === "verified" || verdict.verdict === "computed" ? verdict.recomputedMinor : null;
    report.claims.push({
      leverId: claim.leverId,
      verdict: verdict.verdict,
      reason: "reason" in verdict ? verdict.reason : undefined,
      claimedMinor: claim.estimatedSavingMinor,
      finalMinor,
    });
    if (verdict.verdict === "dropped") {
      report.droppedCount++;
      continue;
    }
    if (finalMinor !== null) acceptedAmounts.push(finalMinor);
    const citedOffer = claim.basis.comparisonOfferId
      ? offers.find((o) => o.id === claim.basis.comparisonOfferId)
      : undefined;
    savings.push({
      leverId: claim.leverId,
      kind: lever.kind,
      verdict: verdict.verdict,
      amountMinor: finalMinor,
      period: claim.period,
      currency: claim.currency,
      explanation: claim.explanation,
      nextStep: lever.nextStep(fields as never, common, locale),
      ...(citedOffer
        ? {
            offer: {
              provider: citedOffer.provider,
              name: citedOffer.name,
              link: citedOffer.link,
              estMonthlyCostMinor: citedOffer.estMonthlyCostMinor,
            },
          }
        : {}),
    });
  }

  // Numeric sweep over all prose: every currency amount must be derivable
  // from extraction data (incl. pairwise sums/diffs) or an accepted saving.
  const derivable = derivableSet(extractionAmountSet(extraction, currency), [
    ...acceptedAmounts,
    ...offers.map((o) => o.estMonthlyCostMinor),
  ]);

  const guardedPitch = decode.negotiationPitch
    ? guardPitch(decode.negotiationPitch, derivable, offers, currency, report)
    : null;

  const guarded: GuardedDecode = {
    language: decode.language,
    headline: sweepText(decode.headline, derivable, currency, "headline", report),
    sections: decode.sections
      .map((s) => ({ ...s, plainExplanation: sweepText(s.plainExplanation, derivable, currency, `section:${s.title}`, report) }))
      .filter((s) => s.plainExplanation.trim().length > 0),
    gotchas: decode.gotchas
      .map((g) => ({ ...g, explanation: sweepText(g.explanation, derivable, currency, `gotcha:${g.checkId}`, report) }))
      .filter((g) => g.explanation.trim().length > 0),
    printedNextSteps: decode.printedNextSteps,
    savings,
    explainMoreQueue: decode.explainMoreQueue.map((t, i) => sweepText(t, derivable, currency, `explain:${i}`, report)).filter((t) => t.trim().length > 0),
    ...(guardedPitch ? { pitch: guardedPitch } : {}),
  };

  return { guarded, report };
}

/**
 * Guard the negotiation pitch: same numeric sweep as all prose, restricted-
 * data redaction on top (a pitch travels to the provider), and a target
 * price that must ground to a cited offer or a bill-derived amount. A pitch
 * whose chat message doesn't survive the sweep is dropped entirely — the
 * customer falls back to DIY next steps rather than sending gutted text.
 */
function guardPitch(
  pitch: NegotiationPitch,
  derivable: Set<number>,
  offers: ComparisonOffer[],
  currency: string,
  report: GuardrailReport,
): GuardedPitch | null {
  const clean = (text: string, where: string): string =>
    redactRestrictedData(sweepText(text, derivable, currency, where, report)).text.trim();

  const chatMessage = clean(pitch.chatMessage, "pitch:chatMessage");
  if (!chatMessage) {
    report.removedSentences.push({ where: "pitch", sentence: "[pitch dropped: chat message fully removed]" });
    return null;
  }

  const citedOffers = pitch.basis.comparisonOfferIds
    .map((id) => offers.find((o) => o.id === id))
    .filter((o): o is ComparisonOffer => o !== undefined);
  let target = pitch.targetMonthlyMinor;
  if (target !== null) {
    const t = target;
    const grounded =
      citedOffers.some((o) => withinTolerance(t, o.estMonthlyCostMinor, currency)) ||
      derivable.has(t) ||
      [...derivable].some((v) => withinTolerance(t, v, currency));
    if (!grounded) target = null;
  }

  // The open ask must contain no currency amounts at all — naming a number
  // there anchors the customer against a counterpart with a hidden discount
  // menu. Enforced in code regardless of what the model wrote.
  const openAsk = stripAmountSentences(clean(pitch.callScript.openAsk, "pitch:openAsk"), report);

  return {
    strategy: pitch.strategy,
    chatMessage,
    callScript: {
      opening: clean(pitch.callScript.opening, "pitch:opening"),
      openAsk,
      onFirstOffer: clean(pitch.callScript.onFirstOffer, "pitch:onFirstOffer"),
      pushHarder: pitch.callScript.pushHarder.map((p, i) => clean(p, `pitch:pushHarder:${i}`)).filter((p) => p.length > 0),
      evidence: pitch.callScript.evidence.map((e, i) => clean(e, `pitch:evidence:${i}`)).filter((e) => e.length > 0),
      objections: pitch.callScript.objections
        .map((o) => ({ ifTheySay: clean(o.ifTheySay, "pitch:objection"), youSay: clean(o.youSay, "pitch:objection") }))
        .filter((o) => o.ifTheySay.length > 0 && o.youSay.length > 0),
      closing: clean(pitch.callScript.closing, "pitch:closing"),
    },
    targetMonthlyMinor: target,
    currency,
  };
}

/** Remove sentences carrying any currency amount (used for the open ask, which must stay number-free). */
function stripAmountSentences(text: string, report: GuardrailReport): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => {
    if (AMOUNT_TOKEN.test(sentence)) {
      AMOUNT_TOKEN.lastIndex = 0;
      report.removedSentences.push({ where: "pitch:openAsk:self-anchor", sentence });
      return false;
    }
    AMOUNT_TOKEN.lastIndex = 0;
    return true;
  });
  return kept.join(" ");
}

/** Run every pack gotcha detector; results injected into the decode prompt as facts. */
export function computeGotchaFacts(
  pack: CategoryPack<any>,
  extraction: MergedExtraction,
): Record<string, boolean | null> {
  const fields = (extraction.category_fields as Record<string, unknown>)[pack.id];
  const facts: Record<string, boolean | null> = {};
  for (const check of pack.decodeHints.gotchaChecks) {
    facts[check.id] = check.detect ? check.detect(fields as never, extraction.common as CommonFields) : null;
  }
  return facts;
}

export { resolvePath };
