import { registerJob } from "../jobs.js";
import { ingestMedia } from "./ingest-media.js";
import { processBill } from "./process-bill.js";

let registered = false;

/** Idempotent handler registration; imported by every job route and the webhook. */
export function registerJobHandlers(): void {
  if (registered) return;
  registered = true;
  registerJob("ingest-media", ingestMedia);
  registerJob("process-bill", processBill);
}
