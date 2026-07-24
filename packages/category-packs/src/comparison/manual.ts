import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CommonFields } from "../common-schema.js";
import type { ComparisonOffer, ComparisonSource } from "../pack.js";

/**
 * Phase-1 comparison source: curated JSON files maintained by hand at
 * fixtures/comparison/{country}/{category}.json. Replaced later by a real
 * feed (regulator open data / partner API) implementing the same interface.
 */
export class ManualDataComparisonSource implements ComparisonSource {
  readonly id = "manual";

  constructor(
    private readonly category: string,
    private readonly baseDir: string = path.resolve(process.cwd(), "fixtures/comparison"),
  ) {}

  async getOffers(_fields: unknown, common: CommonFields): Promise<ComparisonOffer[]> {
    const country = common.country?.toUpperCase();
    if (!country) return [];
    try {
      const raw = await readFile(path.join(this.baseDir, country, `${this.category}.json`), "utf8");
      const offers = JSON.parse(raw) as ComparisonOffer[];
      const today = new Date().toISOString().slice(0, 10);
      return offers.filter((o) => !o.validUntil || o.validUntil >= today);
    } catch {
      return []; // no data for this market yet — savings fall back to optimize-current levers
    }
  }
}
