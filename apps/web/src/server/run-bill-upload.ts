import { splitBills, type BillPage } from "@bills/llm";
import type { SupportedLocale } from "@bills/shared";
import {
  PipelineError,
  isDuplicate,
  runBillPipeline,
  type PipelineOutcome,
  type PipelineStage,
} from "./run-bill-pipeline.js";

/**
 * One upload, however many bills are in it.
 *
 * Everything dropped in one go used to be treated as pages of a single bill. A
 * phone bill and an electricity bill dropped together were read as one
 * document: one provider, one total, line items from both. It did not error, it
 * just quietly answered the wrong question.
 *
 * So the pages are sorted into bills first, and the existing per-bill pipeline
 * runs once per group. runBillPipeline is untouched and still means "one bill",
 * which keeps the WhatsApp path, the dev harness and the duplicate checks
 * working exactly as they did.
 *
 * Bills run one after another rather than in parallel, on purpose. They share
 * the daily spend cap and the per-customer quota, and both are checked per bill
 * upstream, so running them concurrently would let an upload of six slip past a
 * limit that a sequence of six respects. It is also the only way progress can
 * be reported honestly as "bill 2 of 3".
 */

export interface UploadBillResult {
  index: number;
  outcome: PipelineOutcome;
}

export interface UploadFailure {
  index: number;
  error: "unsupported_category" | "pipeline_error" | "overloaded" | "not_attempted";
  detail: string;
}

/**
 * How long the loop may already have spent before it refuses to start another
 * bill.
 *
 * The route allows 800 seconds, but the platform's own function ceiling is what
 * actually applies and it is lower, which is how a two-bill upload got killed
 * mid-stream. 240 seconds leaves room for one more full bill inside a 300
 * second cap and still returns a real answer rather than a dead socket.
 */
const BILL_BUDGET_MS = 240_000;

export interface UploadResult {
  bills: UploadBillResult[];
  failures: UploadFailure[];
  /** How many bills the splitter found. 1 for an ordinary single-bill upload. */
  billCount: number;
}

export interface UploadProgress {
  stage: PipelineStage | "splitting" | "billDone";
  /** 1-based, for "bill 2 of 3". Absent while splitting, which is not per-bill. */
  bill?: number;
  of?: number;
  /** Present only on "billDone": a finished bill, handed over as soon as it is ready. */
  done?: UploadBillResult;
}

export async function runBillUpload(args: {
  customerId: string;
  pages: BillPage[];
  locale: SupportedLocale;
  translate?: boolean;
  force?: boolean;
  onProgress?: (p: UploadProgress) => void;
}): Promise<UploadResult> {
  const { customerId, pages, locale } = args;
  const progress = (p: UploadProgress) => {
    try {
      args.onProgress?.(p);
    } catch {
      // progress is cosmetic — never let it break an upload
    }
  };

  if (pages.length > 1) progress({ stage: "splitting" });
  const { groups, consulted } = await splitBills(pages);
  if (consulted) {
    console.log(`[upload] ${pages.length} pages sorted into ${groups.length} bill(s)`);
  }

  const bills: UploadBillResult[] = [];
  const failures: UploadFailure[] = [];
  const startedAt = Date.now();

  for (const [i, group] of groups.entries()) {
    /* Wall-clock budget, checked before starting each bill rather than after.
       A real bill takes two to four minutes: extraction, a market research
       pass, a live web search and the decode. Two of them exceeded the
       platform's function limit, the process was killed mid-stream, and the
       customer got "connection_dropped" having already waited five minutes,
       with bill 1's finished analysis stranded in the database.

       So a bill is only started if there is plausibly time to finish it. What
       does not fit is reported as not attempted, which is a true and actionable
       answer, unlike a dropped connection. */
    const spent = Date.now() - startedAt;
    if (i > 0 && spent > BILL_BUDGET_MS) {
      for (let rest = i; rest < groups.length; rest++) {
        failures.push({
          index: rest,
          error: "not_attempted",
          detail: "there was not enough time left in this request; upload this one on its own",
        });
      }
      console.warn(`[upload] stopped after ${i}/${groups.length} bills, ${Math.round(spent / 1000)}s spent`);
      break;
    }

    const billPages = group.pageIndices.map((idx) => pages[idx]!);
    try {
      const outcome = await runBillPipeline({
        customerId,
        pages: billPages,
        locale,
        translate: args.translate,
        force: args.force,
        onProgress: (stage) => progress({ stage, bill: i + 1, of: groups.length }),
      });
      bills.push({ index: i, outcome });
      /* Handed over the moment it is ready, not at the end. If the request dies
         while a later bill is running, this one has already reached the person
         instead of being lost with the connection. */
      progress({ stage: "billDone", bill: i + 1, of: groups.length, done: { index: i, outcome } });
    } catch (err) {
      /* One bad bill in a drop of four must not lose the other three. Each
         failure is reported against its own position so the person can see
         which one could not be read, rather than being told the upload
         failed. */
      const code = err instanceof PipelineError ? err.code : "pipeline_error";
      failures.push({ index: i, error: code, detail: sanitize(err) });
      console.error(`[upload] bill ${i + 1}/${groups.length} failed:`, sanitize(err));

      /* Stop after an overload rather than marching through the rest. The
         service is busy, so the remaining bills would almost certainly fail the
         same way, and each attempt spends real tokens up to the point it dies.
         Better to return what succeeded and let the person retry the rest. */
      if (code === "overloaded") {
        for (let rest = i + 1; rest < groups.length; rest++) {
          failures.push({
            index: rest,
            error: "overloaded",
            detail: "not attempted: the analysis service was busy",
          });
        }
        break;
      }
    }
  }

  return { bills, failures, billCount: groups.length };
}

export { isDuplicate };

function sanitize(err: unknown): string {
  return (err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
    .slice(0, 300);
}
