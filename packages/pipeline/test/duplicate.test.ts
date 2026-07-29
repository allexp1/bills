import { describe, expect, it } from "vitest";
import type { CommonFields } from "@bills/category-packs";
import { billFingerprint, hashPages } from "../src/duplicate.js";

function common(over: Partial<CommonFields> = {}): CommonFields {
  return {
    providerName: "Iberdrola",
    accountNumber: "ES-4471 8890",
    customerRefName: null,
    billingPeriodStart: "2026-01-01",
    billingPeriodEnd: "2026-01-31",
    issueDate: "2026-02-03",
    dueDate: "2026-02-20",
    totalAmount: "89,10",
    pastDueAmount: null,
    currency: "EUR",
    country: "ES",
    region: null,
    paymentMethod: null,
    printedNextSteps: [],
    printedDiscounts: [],
    lineItems: [],
    billLanguage: "es",
    ...over,
  };
}

describe("hashPages", () => {
  it("is stable for the same bytes and different for any change", () => {
    const a = [{ data: Buffer.from("page one") }, { data: Buffer.from("page two") }];
    const b = [{ data: Buffer.from("page one") }, { data: Buffer.from("page two") }];
    expect(hashPages(a)).toBe(hashPages(b));

    expect(hashPages(a)).not.toBe(hashPages([{ data: Buffer.from("page one") }]));
    expect(hashPages(a)).not.toBe(
      hashPages([{ data: Buffer.from("page one") }, { data: Buffer.from("page 2") }]),
    );
  });

  it("does not treat re-ordered pages as the same upload", () => {
    const one = { data: Buffer.from("a") };
    const two = { data: Buffer.from("b") };
    expect(hashPages([one, two])).not.toBe(hashPages([two, one]));
  });
});

describe("billFingerprint", () => {
  it("sees through the noise a second photo introduces", () => {
    /* Same bill, read again: casing wobbles, the account number picks up
       different separators, the total is written the other way round. */
    const first = billFingerprint(common());
    const rephotographed = billFingerprint(
      common({ providerName: "IBERDROLA  ", accountNumber: "es44718890", totalAmount: "89.10 €" }),
    );
    expect(first).not.toBeNull();
    expect(rephotographed).toBe(first);
  });

  it("ignores issue and due dates, which a re-issued bill changes", () => {
    expect(billFingerprint(common({ issueDate: "2026-02-09", dueDate: "2026-03-01" }))).toBe(
      billFingerprint(common()),
    );
  });

  it("treats a different total as a different bill", () => {
    /* A corrected bill for the same period is not a duplicate. Getting this
       wrong would hide a real change in what someone owes. */
    expect(billFingerprint(common({ totalAmount: "91,40" }))).not.toBe(billFingerprint(common()));
  });

  it("treats a different period, provider or account as a different bill", () => {
    const base = billFingerprint(common());
    expect(billFingerprint(common({ billingPeriodStart: "2026-02-01", billingPeriodEnd: "2026-02-28" }))).not.toBe(base);
    expect(billFingerprint(common({ providerName: "Endesa" }))).not.toBe(base);
    expect(billFingerprint(common({ accountNumber: "ES-9999 0000" }))).not.toBe(base);
  });

  it("reads grouped and decimal separators the same way round the world", () => {
    // 1.234,56 (es/de) and 1,234.56 (en) are the same money.
    expect(billFingerprint(common({ totalAmount: "1.234,56" }))).toBe(
      billFingerprint(common({ totalAmount: "1,234.56" })),
    );

    /* A three-digit run after the separator is a thousands group, not a
       fraction, so "1,234" and "1.234,00" and "1234" are all the same amount.
       Reading "1,234" as one and a bit would make a €1,234 bill collide with a
       €1.23 one. */
    const grouped = billFingerprint(common({ totalAmount: "1,234" }));
    expect(grouped).toBe(billFingerprint(common({ totalAmount: "1.234,00" })));
    expect(grouped).toBe(billFingerprint(common({ totalAmount: "1234" })));
    expect(grouped).not.toBe(billFingerprint(common({ totalAmount: "1,23" })));
  });

  it("refuses to fingerprint a bill it did not read enough of", () => {
    /* Null here means "decode it normally". A fingerprint over mostly nulls
       would match every other under-extracted bill from the same person and
       answer a real upload with "you already sent this". */
    expect(billFingerprint(common({ providerName: null }))).toBeNull();
    expect(billFingerprint(common({ totalAmount: null }))).toBeNull();
    expect(billFingerprint(common({ totalAmount: "0" }))).toBeNull();
    expect(
      billFingerprint(common({ accountNumber: null, billingPeriodStart: null, billingPeriodEnd: null })),
    ).toBeNull();
  });

  it("still works when the bill shows a period but no account number", () => {
    expect(billFingerprint(common({ accountNumber: null }))).not.toBeNull();
  });

  it("still works when the bill shows an account number but no period", () => {
    expect(
      billFingerprint(common({ billingPeriodStart: null, billingPeriodEnd: null })),
    ).not.toBeNull();
  });

  it("does not collide across currencies", () => {
    expect(billFingerprint(common({ currency: "USD" }))).not.toBe(billFingerprint(common()));
  });
});
