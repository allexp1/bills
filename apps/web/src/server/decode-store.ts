import { desc, eq } from "drizzle-orm";
import { db, decryptJson, schema } from "@bills/db";
import type { GuardedDecode } from "@bills/pipeline";
import type { MergedExtraction } from "@bills/category-packs";
import { keys } from "./wiring.js";

/** Load the latest guarded decode (+ extraction) for an invoice, decrypted. */
export async function loadGuardedDecode(
  invoiceId: string,
): Promise<{ guarded: GuardedDecode; extraction: MergedExtraction; localeRendered: string } | null> {
  const [decodeRow] = await db()
    .select()
    .from(schema.decodes)
    .where(eq(schema.decodes.invoiceId, invoiceId))
    .orderBy(desc(schema.decodes.createdAt))
    .limit(1);
  if (!decodeRow) return null;
  const [extractionRow] = await db()
    .select()
    .from(schema.extractions)
    .where(eq(schema.extractions.id, decodeRow.extractionId))
    .limit(1);
  if (!extractionRow) return null;
  return {
    guarded: decryptJson<GuardedDecode>(keys(), decodeRow.data),
    extraction: decryptJson<MergedExtraction>(keys(), extractionRow.data),
    localeRendered: decodeRow.localeRendered,
  };
}
