import { defineConfig } from "vitest/config";

/**
 * Golden-bill extraction tests hit the real Anthropic API. Run explicitly:
 *   ANTHROPIC_API_KEY=... pnpm test:golden
 * Excluded from the default CI test run (see .github/workflows/ci.yml).
 */
export default defineConfig({
  test: {
    include: ["fixtures/golden-bills/**/*.golden.test.ts"],
    testTimeout: 240_000,
    hookTimeout: 60_000,
  },
});
