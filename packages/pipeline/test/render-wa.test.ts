import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@bills/shared";
import type { GuardedDecode } from "../src/guardrails.js";
import { buildFollowUpButtons, buildSavingsMessages, buildSummaryMessage, t } from "../src/render-wa.js";

const guarded: GuardedDecode = {
  language: "es",
  headline: "Pagas 57,98 € este mes.",
  sections: [],
  gotchas: [
    { checkId: "a", severity: "info", explanation: "info thing", sourceExtractionPaths: [] },
    { checkId: "b", severity: "alert", explanation: "¡Tu permanencia terminó!", sourceExtractionPaths: [] },
  ],
  printedNextSteps: [],
  savings: [
    {
      leverId: "mobile_remove_addons",
      kind: "optimize_current",
      verdict: "verified",
      amountMinor: 1298,
      period: "monthly",
      currency: "EUR",
      explanation: "Dos servicios extra.",
      nextStep: "Responde Actuar.",
    },
    {
      leverId: "mobile_rightsize_plan",
      kind: "switch_provider",
      verdict: "flagged",
      amountMinor: null,
      period: "monthly",
      currency: "EUR",
      explanation: "Puede existir un plan mejor.",
      nextStep: "Responde Actuar.",
    },
  ],
  explainMoreQueue: [],
};

describe("render-wa", () => {
  it("summary message leads with headline, surfaces the worst gotcha, includes the link", () => {
    const msg = buildSummaryMessage(guarded, "es", "https://x.test/s/tok");
    expect(msg.startsWith("Pagas 57,98")).toBe(true);
    expect(msg).toContain("permanencia terminó");
    expect(msg).toContain("https://x.test/s/tok");
    expect(msg.length).toBeLessThanOrEqual(1000);
  });

  it("exactly three follow-up buttons, titles within WhatsApp's 20-char cap, all locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { buttons } = buildFollowUpButtons("INV1", locale);
      expect(buttons).toHaveLength(3);
      for (const b of buttons) {
        expect(b.title.length).toBeLessThanOrEqual(20);
        expect(b.id.endsWith(":INV1")).toBe(true);
      }
    }
  });

  it("savings messages show money only for verified/computed items", () => {
    const msgs = buildSavingsMessages(guarded, "es");
    expect(msgs).toHaveLength(3); // intro + 2 items
    expect(msgs[1]).toContain("12,98");
    expect(msgs[2]).not.toMatch(/\d+,\d{2}/);
    expect(msgs[2]).toContain(t("es", "noNumber"));
  });

  it("every locale has every string (no silent english fallbacks)", () => {
    const keys = ["fullBreakdown", "buttonsBody", "explainMore", "showSavings", "actOnThis", "savingsIntro", "unreadable", "analyzing", "gotPage"];
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        const value = t(locale, key);
        expect(value, `${locale}.${key}`).not.toBe(key);
      }
    }
  });
});
