import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature, verifySubscription } from "../src/whatsapp/signature.js";

const SECRET = "app-secret";
const body = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));
const goodSig = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");

describe("verifyMetaSignature", () => {
  it("accepts a valid signature", () => {
    expect(verifyMetaSignature(body, goodSig, SECRET)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyMetaSignature(Buffer.concat([body, Buffer.from(" ")]), goodSig, SECRET)).toBe(false);
  });
  it("rejects a missing or malformed header", () => {
    expect(verifyMetaSignature(body, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=deadbeef", SECRET)).toBe(false);
  });
  it("rejects a signature made with the wrong secret", () => {
    const wrong = "sha256=" + createHmac("sha256", "other").update(body).digest("hex");
    expect(verifyMetaSignature(body, wrong, SECRET)).toBe(false);
  });
});

describe("verifySubscription", () => {
  it("echoes the challenge for a matching token", () => {
    expect(
      verifySubscription(
        { "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "123" },
        "tok",
      ),
    ).toBe("123");
  });
  it("returns null otherwise", () => {
    expect(verifySubscription({ "hub.mode": "subscribe", "hub.verify_token": "bad" }, "tok")).toBeNull();
  });
});
