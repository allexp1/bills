import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, encryptEnvelope, schema } from "@bills/db";
import { ulid } from "@bills/shared";
import { channelFor, keys } from "../wiring.js";
import { mediaStore } from "../media-store.js";

/**
 * Download a channel media object (WhatsApp short-lived URL or Telegram
 * file), envelope-encrypt the bytes, and persist the ciphertext.
 */
export async function ingestMedia(payload: { mediaObjectId: string; waMediaId: string; peerId?: string }): Promise<void> {
  const [row] = await db()
    .select()
    .from(schema.mediaObjects)
    .where(eq(schema.mediaObjects.id, payload.mediaObjectId))
    .limit(1);
  if (!row || row.storageKey) return; // gone or already ingested (retry)

  const { data, mimeType } = await channelFor(payload.peerId ?? "").downloadMedia(payload.waMediaId);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const envelope = encryptEnvelope(keys(), data);
  const ciphertext = Buffer.from(JSON.stringify(envelope));
  const { storageKey } = await mediaStore().put(`media/${row.invoiceId}/${ulid()}`, ciphertext);

  await db()
    .update(schema.mediaObjects)
    .set({
      storageKey,
      mimeType: row.mimeType || mimeType,
      byteSize: data.length,
      sha256,
      encryptionMeta: { kekId: envelope.kekId, v: envelope.v },
    })
    .where(eq(schema.mediaObjects.id, payload.mediaObjectId));
}
