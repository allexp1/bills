import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { del, put } from "@vercel/blob";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@bills/db";

/**
 * Media storage behind a tiny interface. Vercel Blob in prod; a local
 * directory when BLOB_READ_WRITE_TOKEN is unset. Content is envelope-
 * encrypted by the caller BEFORE it reaches this layer — the store only
 * ever sees ciphertext.
 */
export interface MediaStore {
  put(key: string, data: Buffer): Promise<{ storageKey: string }>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

class VercelBlobStore implements MediaStore {
  async put(key: string, data: Buffer) {
    const blob = await put(key, data, { access: "public", addRandomSuffix: true, contentType: "application/octet-stream" });
    return { storageKey: blob.url };
  }
  async get(storageKey: string) {
    const res = await fetch(storageKey);
    if (!res.ok) throw new Error(`blob fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  async delete(storageKey: string) {
    await del(storageKey);
  }
}

class LocalDirStore implements MediaStore {
  // Serverless filesystems are read-only outside the temp dir; this fallback
  // is ephemeral by design — real persistence comes from Vercel Blob.
  constructor(private readonly dir = path.join(os.tmpdir(), "bills-blob")) {}
  async put(key: string, data: Buffer) {
    const file = path.join(this.dir, key.replaceAll("/", "_"));
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, data);
    return { storageKey: file };
  }
  async get(storageKey: string) {
    return readFile(storageKey);
  }
  async delete(storageKey: string) {
    await rm(storageKey, { force: true });
  }
}

let store: MediaStore | undefined;
export function mediaStore(): MediaStore {
  store ??= process.env.BLOB_READ_WRITE_TOKEN ? new VercelBlobStore() : new LocalDirStore();
  return store;
}

/**
 * No-retention policy: bill images/PDFs exist only long enough to be
 * analyzed. Called as soon as an invoice's pipeline run succeeds (and by
 * the short-window purge cron for stragglers from failed runs). Metadata
 * rows survive with deletedAt set; the ciphertext is gone.
 */
export async function purgeInvoiceMedia(invoiceId: string): Promise<void> {
  const rows = await db()
    .select()
    .from(schema.mediaObjects)
    .where(and(eq(schema.mediaObjects.invoiceId, invoiceId), isNull(schema.mediaObjects.deletedAt)));
  for (const m of rows) {
    if (m.storageKey) await mediaStore().delete(m.storageKey).catch(() => {});
    await db()
      .update(schema.mediaObjects)
      .set({ deletedAt: new Date(), storageKey: "" })
      .where(eq(schema.mediaObjects.id, m.id));
  }
}
