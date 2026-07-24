import { Client as QStashClient } from "@upstash/qstash";
import { env } from "./env.js";

/**
 * Job dispatch. With QSTASH_TOKEN set, jobs are published to QStash which
 * calls back into /api/jobs/<name> (with retries and delayed delivery — the
 * multi-page debounce rides on `delaySeconds`). Without it (local dev), the
 * handler runs in-process after the delay.
 */

export type JobName = "ingest-media" | "process-bill";

export interface JobPayloads {
  "ingest-media": { mediaObjectId: string; waMediaId: string };
  "process-bill": { conversationId: string; invoiceId: string; seq: number };
}

type Handler<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;
const handlers = new Map<JobName, Handler<any>>();

export function registerJob<N extends JobName>(name: N, handler: Handler<N>) {
  handlers.set(name, handler);
}

export async function runJob(name: JobName, payload: unknown): Promise<void> {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`No handler registered for job ${name}`);
  await handler(payload as never);
}

export async function enqueue<N extends JobName>(
  name: N,
  payload: JobPayloads[N],
  opts: { delayMs?: number } = {},
): Promise<void> {
  const token = env.qstashToken;
  if (token) {
    const qstash = new QStashClient({ token });
    await qstash.publishJSON({
      url: `${env.appBaseUrl}/api/jobs/${name}`,
      body: payload,
      delay: opts.delayMs ? Math.ceil(opts.delayMs / 1000) : undefined,
      retries: 3,
    });
    return;
  }
  // Local dev: run in-process. setTimeout is fine under `next dev`.
  const run = () =>
    runJob(name, payload).catch((err) => {
      console.error(`[jobs] ${name} failed`, err instanceof Error ? err.message : err);
    });
  if (opts.delayMs) setTimeout(run, opts.delayMs);
  else void run();
}
