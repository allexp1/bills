import { parseAmount, withinTolerance } from "@bills/shared";
import type { ComparisonOffer, LeverVerdict, SavingsClaim } from "./pack.js";

/**
 * Shared verdict logic: compare the model's claimed saving against a value
 * recomputed in code.
 *  - recomputed null      → "flagged"  (lever plausible, no groundable number)
 *  - within tolerance     → "verified"
 *  - computable, mismatch → "computed" (our number replaces the model's)
 */
export function verdictAgainst(claim: SavingsClaim, recomputedMinor: number | null): LeverVerdict {
  if (recomputedMinor === null) {
    return { verdict: "flagged", reason: "saving not derivable from extracted data" };
  }
  if (recomputedMinor <= 0) {
    return { verdict: "dropped", reason: "recomputed saving is zero or negative" };
  }
  if (withinTolerance(claim.estimatedSavingMinor, recomputedMinor, claim.currency)) {
    return { verdict: "verified", recomputedMinor };
  }
  return { verdict: "computed", recomputedMinor };
}

/** Parse a decimal-string field (as printed on the bill) into minor units. */
export function fieldMinor(value: unknown, currency: string): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return parseAmount(value, currency);
}

/** Saving vs a cited comparison offer: current monthly cost − offer monthly cost. */
export function savingVsOffer(
  claim: SavingsClaim,
  currentMonthlyMinor: number | null,
  offers: ComparisonOffer[] | undefined,
): number | null {
  if (currentMonthlyMinor === null) return null;
  const offer = offers?.find((o) => o.id === claim.basis.comparisonOfferId);
  if (!offer || offer.currency !== claim.currency) return null;
  return currentMonthlyMinor - offer.estMonthlyCostMinor;
}
