import { ManualDataComparisonSource, type CommonFields, type ComparisonOffer } from "@bills/category-packs";
import { WebSearchComparisonSource } from "./comparison-search.js";

/**
 * Gather comparison offers for a bill: curated data (when we have it for the
 * market) plus live web research, deduplicated by provider+plan. Either
 * source failing is non-fatal — savings degrade to optimize-current levers.
 */
export async function gatherOffers(
  category: string,
  fields: unknown,
  common: CommonFields,
): Promise<ComparisonOffer[]> {
  const sources = [
    new ManualDataComparisonSource(category).getOffers(fields, common).catch(() => [] as ComparisonOffer[]),
    process.env.DISABLE_WEB_COMPARISON === "1"
      ? Promise.resolve([] as ComparisonOffer[])
      : new WebSearchComparisonSource(category).getOffers(fields, common),
  ];
  const results = await Promise.all(sources);
  const seen = new Set<string>();
  const merged: ComparisonOffer[] = [];
  for (const offer of results.flat()) {
    const key = `${offer.provider.toLowerCase()}|${offer.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(offer);
  }
  return merged.slice(0, 8);
}
