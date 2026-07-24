import { describe, expect, it } from "vitest";
import { ulid, ULID_REGEX } from "../src/ids.js";
import { parseAmount, formatMoney, withinTolerance } from "../src/money.js";
import { resolveLocale } from "../src/locale.js";
import { redactForLog, redactRestrictedData, waHash } from "../src/redact.js";

describe("ulid", () => {
  it("produces 26-char sortable ids", () => {
    const a = ulid(1000);
    const b = ulid(2000);
    expect(a).toMatch(ULID_REGEX);
    expect(b.slice(0, 10) > a.slice(0, 10)).toBe(true);
  });
});

describe("money", () => {
  it("parses EU and US decimal formats", () => {
    expect(parseAmount("1.234,56", "EUR")).toBe(123456);
    expect(parseAmount("1,234.56", "EUR")).toBe(123456);
    expect(parseAmount("€ 89,10", "EUR")).toBe(8910);
    expect(parseAmount("garbage", "EUR")).toBeNull();
  });
  it("formats for the customer's locale", () => {
    expect(formatMoney({ amountMinor: 123456, currency: "EUR" }, "de")).toContain("1.234,56");
  });
  it("tolerance: within 2% or one unit", () => {
    expect(withinTolerance(10000, 10150, "EUR")).toBe(true); // 1.5%
    expect(withinTolerance(10000, 10350, "EUR")).toBe(false); // 3.5%
    expect(withinTolerance(50, 120, "EUR")).toBe(true); // < 1 EUR apart
  });
});

describe("locale", () => {
  it("maps WhatsApp locale tags", () => {
    expect(resolveLocale("pt_BR")).toBe("pt");
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("zh_CN")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });
});

describe("redaction", () => {
  it("strips forbidden keys from log objects", () => {
    const out = redactForLog({ phone: "+491701234567", nested: { body: "hi", ok: 1 } });
    expect(out.phone).toBe("[redacted]");
    expect(out.nested.body).toBe("[redacted]");
    expect(out.nested.ok).toBe(1);
  });
  it("hashes phones deterministically", () => {
    expect(waHash("+34600111222", "pepper")).toBe(waHash("+34600111222", "pepper"));
    expect(waHash("+34600111222", "pepper")).not.toContain("34600");
  });
  it("redacts Luhn-valid card numbers but not invoice totals", () => {
    const { text, spans } = redactRestrictedData(
      "My card is 4111 1111 1111 1111 and the bill total is 89,10",
    );
    expect(text).toContain("[card number redacted]");
    expect(text).toContain("89,10");
    expect(spans[0]).toMatchObject({ reason: "card_number", match: "****1111" });
  });
  it("redacts Spanish DNI", () => {
    const { text } = redactRestrictedData("mi dni es 12345678Z gracias");
    expect(text).toContain("[ID redacted]");
  });
  it("redacts numeric codes only under OTP context", () => {
    expect(redactRestrictedData("code: 482913", { otpHint: true }).text).toContain("[OTP redacted]");
    expect(redactRestrictedData("total 482913", {}).text).toContain("482913");
  });
});
