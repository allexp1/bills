import { z } from "zod";
import { CommonFieldsSchema } from "./common-schema.js";
import { normalizeWireData, toWireSchema } from "./wire.js";
import type { CategoryPack } from "./pack.js";
import { energyPack } from "./packs/energy/index.js";
import { broadbandPack } from "./packs/broadband/index.js";
import { mobilePack } from "./packs/mobile/index.js";
import { utilityPack } from "./packs/utility/index.js";
import { statementPack } from "./packs/statement/index.js";

const PACKS: CategoryPack<any>[] = [energyPack, broadbandPack, mobilePack, utilityPack, statementPack];

export function allPacks(): CategoryPack<any>[] {
  return PACKS;
}

export function getPack(id: string): CategoryPack<any> | undefined {
  return PACKS.find((p) => p.id === id);
}

/**
 * The single structured-output schema for the vision extraction call.
 * Exactly one entry of `category_fields` is populated; the rest are null.
 */
export function mergedExtractionSchema(packs: CategoryPack<any>[] = PACKS) {
  const categoryFields: Record<string, z.ZodTypeAny> = {};
  for (const pack of packs) categoryFields[pack.id] = pack.extractionSchema.nullable();

  const categoryIds = packs.map((p) => p.id as string);
  return z.object({
    category: z.enum([...categoryIds, "unknown"]),
    category_confidence: z.number(),
    common: CommonFieldsSchema,
    category_fields: z.object(categoryFields),
    /** Per-field confidence 0–1, keyed by dotted path. Null when not assessed. */
    field_confidence: z.record(z.string(), z.number()).nullable(),
    pages_used: z.array(z.number()),
  });
}

export type MergedExtraction = z.infer<ReturnType<typeof mergedExtractionSchema>>;

/**
 * Wire variant for the structured-output API call: leaf nullables replaced by
 * sentinels to stay under the API's 16-union-parameter limit. Convert results
 * back with `normalizeExtraction`.
 */
export function mergedWireExtractionSchema(packs: CategoryPack<any>[] = PACKS) {
  return toWireSchema(mergedExtractionSchema(packs)) as ReturnType<typeof mergedExtractionSchema>;
}

export function normalizeExtraction(
  wireData: unknown,
  packs: CategoryPack<any>[] = PACKS,
): MergedExtraction {
  const domain = mergedExtractionSchema(packs);
  return domain.parse(normalizeWireData(domain, wireData));
}

/** Combined per-field prompt annotations for the extraction system prompt. */
export function combinedExtractionHints(packs: CategoryPack<any>[] = PACKS): string {
  return packs
    .map((pack) => {
      const lines = Object.entries(pack.extractionHints)
        .map(([path, hint]) => `- ${pack.id}.${path}: ${hint}`)
        .join("\n");
      return `### ${pack.id}\n${lines}`;
    })
    .join("\n\n");
}
