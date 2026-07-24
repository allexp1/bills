import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractBill } from "@bills/llm";
import { parseAmount, withinTolerance } from "@bills/shared";

/**
 * Golden-bill suite: run each fixture through real vision extraction and
 * assert the key fields. Numeric assertions use the shared tolerance so
 * OCR-level jitter doesn't flake the suite; category and structural facts
 * are exact.
 */

interface Expected {
  category: string;
  common: { currency: string; totalAmount: number; dueDate?: string; providerContains: string };
  fields: Record<string, unknown>;
}

const base = path.dirname(fileURLToPath(import.meta.url));
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

const cases: Array<{ category: string; name: string; pdf: Buffer; expected: Expected }> = [];
for (const category of ["energy", "broadband", "mobile"]) {
  const dir = path.join(base, category);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".expected.json"));
  } catch {
    continue;
  }
  for (const expectedFile of files) {
    const name = expectedFile.replace(".expected.json", "");
    cases.push({
      category,
      name,
      pdf: readFileSync(path.join(dir, `${name}.pdf`)),
      expected: JSON.parse(readFileSync(path.join(dir, expectedFile), "utf8")),
    });
  }
}

describe.skipIf(!hasKey)("golden bill extraction", () => {
  for (const c of cases) {
    it(`${c.category}/${c.name}`, async () => {
      const { extraction, usage } = await extractBill([{ data: c.pdf, mimeType: "application/pdf" }]);
      console.log(`[golden] ${c.category}/${c.name} tokens in=${usage.inputTokens} out=${usage.outputTokens}`);

      expect(extraction.category).toBe(c.expected.category);
      expect(extraction.common.currency).toBe(c.expected.common.currency);
      expect(extraction.common.providerName ?? "").toContain(c.expected.common.providerContains);

      const total = parseAmount(extraction.common.totalAmount ?? "", c.expected.common.currency);
      expect(total).not.toBeNull();
      expect(withinTolerance(total!, c.expected.common.totalAmount, c.expected.common.currency)).toBe(true);
      if (c.expected.common.dueDate) expect(extraction.common.dueDate).toBe(c.expected.common.dueDate);

      const fields = (extraction.category_fields as Record<string, any>)[c.category];
      expect(fields).toBeTruthy();
      if (c.category === "energy" && c.expected.fields.hasEstimatedRead) {
        expect(fields.meterReads.some((r: any) => r.kind === "estimated")).toBe(true);
      }
      if (c.category === "broadband" && c.expected.fields.outOfContractMonthly) {
        const out = parseAmount(fields.outOfContractPrice ?? "", "EUR");
        expect(out).not.toBeNull();
        expect(withinTolerance(out!, c.expected.fields.outOfContractMonthly as number, "EUR")).toBe(true);
      }
      if (c.category === "mobile" && c.expected.fields.addOnCount) {
        expect(fields.addOns.length).toBeGreaterThanOrEqual(c.expected.fields.addOnCount as number);
      }
    });
  }
});

describe.skipIf(hasKey)("golden bill extraction (skipped)", () => {
  it("requires ANTHROPIC_API_KEY", () => {
    expect(cases.length).toBeGreaterThan(0); // fixtures exist even when skipped
  });
});
