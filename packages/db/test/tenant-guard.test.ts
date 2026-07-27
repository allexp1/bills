import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertCustomerId, TenantError } from "../src/tenant.js";

const REPO_DIR = join(import.meta.dirname, "../src/repo");

/**
 * A tenant leak is not the kind of bug you find by using the product: every
 * page looks correct to the person who has the data. These tests fail the
 * build when the pattern that prevents it is broken, rather than waiting for
 * someone to notice their neighbour's electricity bill.
 */
describe("tenant guard", () => {
  it("rejects anything that is not a ULID", () => {
    expect(() => assertCustomerId("' or 1=1 --")).toThrow(TenantError);
    expect(() => assertCustomerId("")).toThrow(TenantError);
    expect(() => assertCustomerId("01J0000000000000000000000")).toThrow(TenantError); // 25 chars
    expect(() => assertCustomerId("01J000000000000000000000000")).toThrow(TenantError); // 27
    expect(assertCustomerId("01J8ZQ9X0000000000000000AB")).toBe("01J8ZQ9X0000000000000000AB");
  });

  it("routes every repository read through withTenant", () => {
    for (const file of readdirSync(REPO_DIR).filter((f) => f.endsWith(".ts"))) {
      const source = readFileSync(join(REPO_DIR, file), "utf8");

      /* Each exported function must open a tenant scope. Anything that
         genuinely spans customers belongs in a cron path using withoutTenant,
         not in here. */
      const exportedFns = source.match(/export async function (\w+)/g) ?? [];
      expect(exportedFns.length, `${file} exports no functions`).toBeGreaterThan(0);

      const scopes = source.match(/withTenant\(/g)?.length ?? 0;
      expect(scopes, `${file} has ${exportedFns.length} exports but ${scopes} withTenant calls`)
        .toBeGreaterThanOrEqual(exportedFns.length);

      expect(source.includes("withoutTenant"), `${file} must not bypass tenant scope`).toBe(false);
    }
  });

  it("filters selects on customerId even though RLS also would", () => {
    for (const file of readdirSync(REPO_DIR).filter((f) => f.endsWith(".ts"))) {
      const source = readFileSync(join(REPO_DIR, file), "utf8");
      const selects = source.match(/\.from\(schema\.(\w+)\)/g) ?? [];
      const filters = source.match(/customerId|customers\.id/g) ?? [];
      expect(
        filters.length,
        `${file} queries ${selects.length} tables with ${filters.length} tenant references`,
      ).toBeGreaterThanOrEqual(selects.length);
    }
  });
});
