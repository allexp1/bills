import { describe, expect, it } from "vitest";
import { mintSummaryToken, verifySummaryToken } from "../src/summary-token.js";

const SECRET = "test-secret";

describe("summary tokens", () => {
  it("mints and verifies", () => {
    const minted = mintSummaryToken("INV123", SECRET);
    const result = verifySummaryToken(minted.token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.inv).toBe("INV123");
      expect(result.tokenHash).toBe(minted.tokenHash);
    }
  });

  it("rejects expiry", () => {
    const minted = mintSummaryToken("INV123", SECRET, 60, Date.now() - 120_000);
    expect(verifySummaryToken(minted.token, SECRET)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects tampered payloads", () => {
    const minted = mintSummaryToken("INV123", SECRET);
    const [h, p, s] = minted.token.split(".") as [string, string, string];
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    claims.inv = "OTHER";
    const forgedPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    expect(verifySummaryToken(`${h}.${forgedPayload}.${s}`, SECRET).ok).toBe(false);
  });

  it("rejects wrong secret and garbage", () => {
    const minted = mintSummaryToken("INV123", "other-secret");
    expect(verifySummaryToken(minted.token, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySummaryToken("not-a-token", SECRET)).toEqual({ ok: false, reason: "malformed" });
  });
});
