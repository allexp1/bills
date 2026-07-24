import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  envKeyring,
  type Keyring,
} from "../src/crypto/envelope.js";

function testKeyring(): Keyring {
  const kek = randomBytes(32);
  return { kekId: "test-1", getKek: (id) => {
    if (id !== "test-1") throw new Error("unknown kek");
    return kek;
  }};
}

describe("envelope encryption", () => {
  it("round-trips JSON", () => {
    const kr = testKeyring();
    const value = { total: 8910, items: [{ label: "Grundpreis", amount: 1250 }] };
    expect(decryptJson(kr, encryptJson(kr, value))).toEqual(value);
  });

  it("round-trips text and produces distinct ciphertexts per call", () => {
    const kr = testKeyring();
    const a = encryptText(kr, "account 123456");
    const b = encryptText(kr, "account 123456");
    expect(a.equals(b)).toBe(false); // fresh DEK + IV per value
    expect(decryptText(kr, a)).toBe("account 123456");
  });

  it("fails on tampered ciphertext", () => {
    const kr = testKeyring();
    const stored = encryptText(kr, "secret");
    const parsed = JSON.parse(stored.toString());
    const ct = Buffer.from(parsed.ct, "base64");
    ct[0] = ct[0]! ^ 0xff;
    parsed.ct = ct.toString("base64");
    expect(() => decryptText(kr, Buffer.from(JSON.stringify(parsed)))).toThrow();
  });

  it("fails on unknown KEK id", () => {
    const kr = testKeyring();
    const stored = encryptText(kr, "secret");
    const parsed = JSON.parse(stored.toString());
    parsed.kekId = "other";
    expect(() => decryptText(kr, Buffer.from(JSON.stringify(parsed)))).toThrow(/unknown kek/i);
  });

  it("envKeyring validates KEK shape", () => {
    expect(() => envKeyring({} as NodeJS.ProcessEnv)).toThrow(/not set/);
    expect(() =>
      envKeyring({ ENVELOPE_KEK_BASE64: Buffer.from("short").toString("base64") } as NodeJS.ProcessEnv),
    ).toThrow(/32 bytes/);
    const kr = envKeyring({
      ENVELOPE_KEK_BASE64: randomBytes(32).toString("base64"),
      ENVELOPE_KEK_ID: "kek-x",
    } as NodeJS.ProcessEnv);
    expect(kr.kekId).toBe("kek-x");
  });
});
