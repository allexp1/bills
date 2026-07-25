import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@bills/shared";
import type { GuardedDecode } from "../src/guardrails.js";
import { buildFollowUpButtons, buildProviderChatCta, buildSavingsMessages, buildSummaryMessage, t } from "../src/render-wa.js";

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

  it("provider WhatsApp link: absent without directory hit, appended with preloaded localized draft when present", () => {
    expect(buildProviderChatCta(guarded, "es")).toBeNull();
    expect(buildSavingsMessages(guarded, "es")).toHaveLength(3);

    const withWa: GuardedDecode = {
      ...guarded,
      providerChat: { providerName: "Movistar", channel: "whatsapp", waNumber: "+34 638 101 004", source: "https://comunidad.movistar.es/..." },
    };
    const cta = buildProviderChatCta(withWa, "es");
    expect(cta?.url).toMatch(/^https:\/\/wa\.me\/34638101004\?text=/);
    expect(decodeURIComponent(cta!.url.split("text=")[1]!)).toContain("cliente de Movistar");

    const msgs = buildSavingsMessages(withWa, "es");
    expect(msgs).toHaveLength(4); // intro + 2 items + provider CTA
    expect(msgs[3]).toContain("wa.me/34638101004");
    expect(msgs[3]).toContain("Movistar");
  });

  it("legacy stored decodes with the old providerWa shape still get a WhatsApp CTA", () => {
    const legacy: GuardedDecode = {
      ...guarded,
      providerWa: { providerName: "Movistar", waNumber: "+34638101004", source: "https://..." },
    };
    expect(buildProviderChatCta(legacy, "es")?.channel).toBe("whatsapp");
  });

  it("sms channel: deep link with body, instruction-only text inside WhatsApp messages", () => {
    const sms: GuardedDecode = {
      ...guarded,
      providerChat: { providerName: "Xfinity", channel: "sms", smsNumber: "266278", source: "https://xfinity.com/..." },
    };
    const cta = buildProviderChatCta(sms, "en");
    expect(cta?.url).toMatch(/^sms:266278\?&body=/);
    expect(decodeURIComponent(cta!.url.split("body=")[1]!)).toContain("Xfinity customer");

    const msgs = buildSavingsMessages(sms, "en");
    expect(msgs[3]).toContain("266278");
    expect(msgs[3]).not.toContain("sms:"); // sms: URIs aren't tappable in WhatsApp

    const keyword: GuardedDecode = {
      ...guarded,
      providerChat: { providerName: "AT&T", channel: "sms", smsNumber: "75421", smsBody: "prepaid", source: "https://att.com/..." },
    };
    expect(buildProviderChatCta(keyword, "en")?.url).toBe("sms:75421?&body=prepaid");
    expect(buildSavingsMessages(keyword, "en")[3]).toContain('"prepaid"');
  });

  it("web_chat channel: plain official URL, no preloaded text", () => {
    const web: GuardedDecode = {
      ...guarded,
      providerChat: { providerName: "Verizon", channel: "web_chat", chatUrl: "https://www.verizon.com/support/contact-us/", source: "https://www.verizon.com/support/contact-us" },
    };
    const cta = buildProviderChatCta(web, "en");
    expect(cta?.url).toBe("https://www.verizon.com/support/contact-us/");
    expect(buildSavingsMessages(web, "en")[3]).toContain("https://www.verizon.com/support/contact-us/");
  });

  it("every locale has every string (no silent english fallbacks)", () => {
    const keys = ["fullBreakdown", "buttonsBody", "explainMore", "showSavings", "actOnThis", "savingsIntro", "unreadable", "analyzing", "gotPage", "providerWaCta", "providerWaDraft", "providerSmsCta", "providerSmsCtaKeyword", "providerChatCta"];
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        const value = t(locale, key);
        expect(value, `${locale}.${key}`).not.toBe(key);
      }
    }
  });
});
