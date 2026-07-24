import type { ZodObject, ZodRawShape } from "zod";
import type { Category, Localized, SupportedLocale } from "@bills/shared";
import type { CommonFields } from "./common-schema.js";

/**
 * A category pack is everything the core pipeline needs to support one bill
 * category: what to extract, how to explain it, and which savings levers
 * exist. Adding a category never touches core code — one folder + registry
 * entry + fixtures.
 */
export interface CategoryPack<TFields = unknown> {
  id: Category | (string & {});
  version: string; // semver, recorded on every extraction
  displayName: Localized;
  /** Restrict to countries when the pack has market-specific logic. undefined = all. */
  countries?: string[];
  /** Zod fragment merged into the vision call's structured-output schema. All leaves nullable. */
  extractionSchema: ZodObject<ZodRawShape>;
  /** Per-field prompt annotations, keyed by field path. */
  extractionHints: Record<string, string>;
  decodeHints: {
    /** Category jargon → plain language, injected into the decode prompt. */
    lineItemGlossary: string;
    gotchaChecks: GotchaCheck<TFields>[];
  };
  savingsLevers: SavingsLever<TFields>[];
  /** Where "cheaper alternative" data plugs in. Optional; Phase 1 uses manual data. */
  comparisonSource?: ComparisonSource<TFields>;
}

export interface GotchaCheck<TFields = unknown> {
  id: string; // "estimated_reads", "out_of_contract_jump", "promo_expiry", ...
  /** Instruction to the decode model (what to look for, how to explain it). */
  promptFragment: string;
  /**
   * Optional deterministic detector run in code. true/false results are
   * injected into the decode prompt as confirmed facts so the model doesn't
   * have to infer them; null = undecidable from extracted data.
   */
  detect?: (fields: TFields, common: CommonFields) => boolean | null;
}

/** A savings claim as produced by the decode model. Numbers are integer minor units. */
export interface SavingsClaim {
  leverId: string;
  estimatedSavingMinor: number;
  period: "monthly" | "annual" | "one_off";
  currency: string;
  basis: {
    /** JSON paths into the extraction (e.g. "category_fields.mobile.addOns.0.amount"). */
    extractionPaths: string[];
    /** Optional arithmetic over the cited paths, human-readable. */
    formula?: string;
    /** When the saving compares against a market offer. */
    comparisonOfferId?: string;
  };
  explanation: string;
}

export type LeverVerdict =
  | { verdict: "verified"; recomputedMinor: number }
  | { verdict: "computed"; recomputedMinor: number }
  | { verdict: "flagged"; reason: string } // keep the lever, strip the number
  | { verdict: "dropped"; reason: string }; // fabricated / not derivable

export interface SavingsLever<TFields = unknown> {
  id: string;
  kind: "optimize_current" | "switch_provider";
  title: Localized;
  /** When/how the decode model should propose this lever. */
  promptFragment: string;
  /** Code precondition; the lever is only offered to the model when true or null. */
  applies?: (fields: TFields, common: CommonFields) => boolean | null;
  /** THE guardrail: verify the model's claimed number is derivable from data. */
  validate: (
    claim: SavingsClaim,
    fields: TFields,
    common: CommonFields,
    comparison?: ComparisonOffer[],
  ) => LeverVerdict;
  /** Localized concrete next step ("call X and say Y" / "reply 'Act on this'"). */
  nextStep: (fields: TFields, common: CommonFields, locale: SupportedLocale) => string;
}

export interface ComparisonOffer {
  id: string;
  provider: string;
  name: string; // tariff/plan name
  estMonthlyCostMinor: number;
  currency: string;
  country: string;
  link?: string;
  validUntil?: string; // ISO date
  notes?: string;
}

export interface ComparisonSource<TFields = unknown> {
  id: string;
  getOffers(fields: TFields, common: CommonFields): Promise<ComparisonOffer[]>;
}
