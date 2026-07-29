import { createHash } from "node:crypto";
import type { CommonFields } from "@bills/category-packs";

/**
 * Recognising a bill we have already decoded.
 *
 * People re-send bills constantly, and for good reasons: the first upload
 * seemed to hang, the photo looked blurry, they forgot they had done it last
 * week. Every repeat costs a full extraction and decode and leaves a second
 * row that makes the portfolio read as if they are paying twice.
 *
 * Two fingerprints, because "the same bill" means two different things.
 */

/**
 * The same FILE, re-sent. sha256 over the per-page sha256s in order, so it is
 * stable across re-ordering of nothing and changes if any byte does.
 *
 * Computable before a single model call, which is the entire reason it exists
 * next to the semantic fingerprint below. A re-send caught here costs nothing.
 *
 * Order matters on purpose. The same pages uploaded back to front are a
 * different reading of the bill and the extraction may genuinely differ, so
 * they are not treated as identical here. If they really are the same bill the
 * semantic fingerprint catches them one step later.
 */
export function hashPages(pages: ReadonlyArray<{ data: Buffer }>): string {
  const perPage = pages.map((p) => createHash("sha256").update(p.data).digest("hex"));
  return createHash("sha256").update(perPage.join(":")).digest("hex");
}

/**
 * The same BILL, photographed again. A different camera angle, a scan instead
 * of a photo, a PDF instead of a screenshot: different bytes, same document.
 *
 * The identity of a bill is the provider, the account it is for, the period it
 * covers and what it asks for. Two bills matching on all four are the same
 * bill in every case that matters.
 *
 * What is deliberately NOT in here:
 *
 *   Issue and due dates. A re-issued or corrected bill keeps the period and
 *   changes these, and it is a genuinely different bill.
 *
 *   Line items. OCR of a blurry photo drops or mangles them, so including them
 *   would make the fingerprint depend on photo quality, which is exactly the
 *   variation this is supposed to see through.
 *
 * The total IS included, so a corrected bill for the same period with a
 * different amount is correctly treated as new. That is the right way round:
 * missing a duplicate costs one wasted analysis, wrongly merging a corrected
 * bill hides a real change in what someone owes.
 *
 * Returns null when there is not enough to be sure. A fingerprint over mostly
 * nulls would match every other under-extracted bill from the same customer,
 * which is far worse than not checking: it would hide real bills behind a
 * "you already sent this". Provider and total are the floor, plus at least one
 * of period or account number.
 */
export function billFingerprint(common: CommonFields): string | null {
  const provider = normalise(common.providerName);
  const total = normaliseAmount(common.totalAmount);
  if (!provider || !total) return null;

  const account = normaliseAccount(common.accountNumber);
  const period = [common.billingPeriodStart, common.billingPeriodEnd]
    .map((d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""))
    .join("_");
  if (!account && period === "_") return null;

  return createHash("sha256")
    .update([provider, account, period, total, normalise(common.currency)].join("|"))
    .digest("hex");
}

/** Case and whitespace vary with OCR; the name does not. */
function normalise(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Account numbers get printed with spaces, dashes and slashes that OCR reads
 * inconsistently. Only the alphanumerics identify the account.
 */
function normaliseAccount(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The total arrives as printed, so "1.234,56" and "1234.56" are the same
 * money written by different countries. Reduce to digits and a single decimal
 * separator rather than parsing to minor units, because that needs a currency
 * and the currency itself is sometimes missing.
 */
function normaliseAmount(value: string | null): string {
  const raw = (value ?? "").replace(/[^\d.,-]/g, "");
  if (!raw) return "";
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const sep = Math.max(lastComma, lastDot);
  /* Fewer than three digits after the last separator means it is decimal;
     exactly three is ambiguous ("1,234" is a thousands group far more often
     than a tenth of a cent), so it is treated as a group. */
  const decimal = sep >= 0 && raw.length - sep - 1 > 0 && raw.length - sep - 1 < 3;
  const whole = (decimal ? raw.slice(0, sep) : raw).replace(/[^\d-]/g, "");
  const frac = decimal ? raw.slice(sep + 1).replace(/\D/g, "").padEnd(2, "0").slice(0, 2) : "00";
  const digits = `${whole || "0"}.${frac}`;
  return digits === "0.00" ? "" : digits;
}
