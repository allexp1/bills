import { describe, expect, it } from "vitest";
import { redactRestrictedData } from "@bills/shared";
import { assertTransition, authorizationActive, canTransition } from "../src/lifecycle.js";
import { disclosureMessage, violatesDisclosure } from "../src/disclosure.js";
import { InMemoryOtpStore, OTP_TTL_MS } from "../src/otp-relay.js";

describe("mission lifecycle", () => {
  it("allows the happy path", () => {
    const path = [
      "draft",
      "awaiting_authorization",
      "authorized",
      "queued",
      "contacting_provider",
      "in_progress",
      "awaiting_customer",
      "in_progress",
      "completed",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it("blocks skipping authorization", () => {
    expect(canTransition("draft", "contacting_provider")).toBe(false);
    expect(canTransition("awaiting_authorization", "in_progress")).toBe(false);
    expect(() => assertTransition("draft", "in_progress")).toThrow(/Illegal/);
  });

  it("terminal states have no exits", () => {
    for (const terminal of ["completed", "failed", "cancelled"] as const) {
      expect(canTransition(terminal, "in_progress")).toBe(false);
    }
  });

  it("authorizationActive enforces granted/revoked/expired", () => {
    const now = new Date("2026-07-24T12:00:00Z");
    expect(authorizationActive(null, now)).toBe(false);
    expect(authorizationActive({ grantedAt: null, revokedAt: null, expiresAt: null }, now)).toBe(false);
    expect(authorizationActive({ grantedAt: new Date("2026-07-01"), revokedAt: null, expiresAt: new Date("2026-08-01") }, now)).toBe(true);
    expect(authorizationActive({ grantedAt: new Date("2026-07-01"), revokedAt: new Date("2026-07-02"), expiresAt: null }, now)).toBe(false);
    expect(authorizationActive({ grantedAt: new Date("2026-05-01"), revokedAt: null, expiresAt: new Date("2026-06-01") }, now)).toBe(false);
  });
});

describe("disclosure", () => {
  it("renders the fixed preamble in the provider's language", () => {
    const msg = disclosureMessage("es", { customerFirstName: "Ana", accountMasked: "…4821", goal: "renegociar la tarifa" });
    expect(msg).toContain("asistente de IA");
    expect(msg).toContain("Ana");
    expect(msg).toContain("…4821");
    expect(msg).toContain("autorización por escrito");
  });

  it("falls back to English for unknown provider locales", () => {
    expect(disclosureMessage("nl", { customerFirstName: "Jan", accountMasked: "…1", goal: "x" })).toContain("AI assistant");
  });

  it("blocks impersonation phrasing in any launch language", () => {
    expect(violatesDisclosure("I am not an AI, I'm the customer calling about my bill")).toBe(true);
    expect(violatesDisclosure("Soy el cliente y quiero cancelar")).toBe(true);
    expect(violatesDisclosure("Ich bin kein Bot")).toBe(true);
    expect(violatesDisclosure("I'm an AI assistant acting on behalf of your customer")).toBe(false);
  });
});

describe("OTP relay", () => {
  it("take() is read-once and TTL-bound", async () => {
    let t = 0;
    const store = new InMemoryOtpStore(() => t);
    await store.put("m1", "482913");
    expect(await store.take("m1")).toBe("482913");
    expect(await store.take("m1")).toBeNull(); // consumed

    await store.put("m2", "111222");
    t += OTP_TTL_MS + 1;
    expect(await store.take("m2")).toBeNull(); // expired
  });

  it("transcripts never contain the code (shared redaction with otpHint)", () => {
    const { text } = redactRestrictedData("el código es 482913", { otpHint: true });
    expect(text).not.toContain("482913");
    expect(text).toContain("[OTP redacted]");
  });
});

describe("restricted-data corpus (cards + IDs across locales)", () => {
  const corpus = [
    "mi tarjeta 4111 1111 1111 1111 caduca pronto",
    "card: 5500-0000-0000-0004",
    "DNI 12345678Z",
    "NIE X1234567L",
    "numéro de sécu 1 85 05 78 006 048 22",
    "Steuer-ID DE 12345678901",
  ];
  it("catches 100% of the corpus", () => {
    for (const sample of corpus) {
      const { spans } = redactRestrictedData(sample);
      expect(spans.length, sample).toBeGreaterThan(0);
    }
  });
  it("never eats ordinary bill amounts", () => {
    const { text, spans } = redactRestrictedData("total 89,10 € due 2026-08-01");
    expect(spans).toEqual([]);
    expect(text).toContain("89,10");
  });
});
