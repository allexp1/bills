import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { lookupProviderChat } from "../src/providers/directory.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "providers-"));
  await writeFile(
    path.join(dir, "ES.json"),
    JSON.stringify([
      {
        name: "Vodafone",
        aliases: ["Vodafone España"],
        categories: ["mobile", "broadband"],
        waNumber: "+34607100100",
        source: "https://ayudacliente.vodafone.es/...",
      },
      { name: "Movistar", aliases: ["Telefónica"], categories: ["mobile"], waNumber: "+34638101004", source: "https://comunidad.movistar.es/..." },
    ]),
  );
});

describe("lookupProviderChat", () => {
  it("matches the legal-noise names bills actually print", async () => {
    const hit = await lookupProviderChat("Vodafone España S.A.U.", "es", "mobile", dir);
    expect(hit?.waNumber).toBe("+34607100100");
  });

  it("matches aliases with diacritics normalized", async () => {
    const hit = await lookupProviderChat("TELEFONICA DE ESPAÑA", "ES", "mobile", dir);
    expect(hit?.waNumber).toBe("+34638101004");
  });

  it("respects the category scope of an entry", async () => {
    expect(await lookupProviderChat("Movistar", "ES", "energy", dir)).toBeNull();
  });

  it("null for unlisted providers, unknown countries, and missing inputs", async () => {
    expect(await lookupProviderChat("Endesa", "ES", "energy", dir)).toBeNull();
    expect(await lookupProviderChat("Vodafone", "DE", "mobile", dir)).toBeNull();
    expect(await lookupProviderChat(null, "ES", "mobile", dir)).toBeNull();
    expect(await lookupProviderChat("Vodafone", null, "mobile", dir)).toBeNull();
  });

  it("does not match on short/generic fragments", async () => {
    expect(await lookupProviderChat("Iberdrola Clientes S.A.U.", "ES", undefined, dir)).toBeNull();
  });

  it("finds the shipped ES directory from the package cwd", async () => {
    const hit = await lookupProviderChat("Orange Espagne S.A.U.", "ES", "broadband");
    expect(hit?.waNumber).toBe("+34653850085");
  });

  it("shipped directories parse and match across markets", async () => {
    expect((await lookupProviderChat("Iberdrola Clientes S.A.U.", "ES", "energy"))?.waNumber).toBe("+34601225235");
    expect((await lookupProviderChat("EDP Comercial", "PT", "energy"))?.waNumber).toBe("+351911955282");
    expect((await lookupProviderChat("Telekom Deutschland GmbH", "DE", "broadband"))?.waNumber).toBe("+4915142227878");
    expect((await lookupProviderChat("Telefônica Brasil S.A. (Vivo)", "BR", "mobile"))?.waNumber).toBe("+5511999151515");
    expect((await lookupProviderChat("Oi S.A.", "BR", "broadband"))?.waNumber).toBe("+553131313131");
    expect((await lookupProviderChat("AT&T Comunicaciones Digitales", "MX", "mobile"))?.waNumber).toBe("+525569329582");
    expect((await lookupProviderChat("EDF Energy Customers Ltd", "GB", "energy"))?.waNumber).toBe("+447782569959");
    // FR intentionally has no file — every lookup must be null, never a guess.
    expect(await lookupProviderChat("Orange France", "FR", "mobile")).toBeNull();
  });

  it("US entries carry sms/web_chat channels (never WhatsApp)", async () => {
    const xfinity = await lookupProviderChat("Comcast Cable Communications", "US", "broadband");
    expect(xfinity?.channel).toBe("sms");
    expect(xfinity?.smsNumber).toBe("266278");

    const verizon = await lookupProviderChat("Verizon Wireless", "US", "mobile");
    expect(verizon?.channel).toBe("web_chat");
    expect(verizon?.chatUrl).toContain("verizon.com");

    const pge = await lookupProviderChat("Pacific Gas and Electric Company", "US", "energy");
    expect(pge?.channel).toBe("web_chat");
    for (const entry of [xfinity, verizon, pge]) expect(entry?.waNumber).toBeUndefined();
  });

  it("entries missing their channel's endpoint are skipped, and channel defaults to whatsapp", async () => {
    const badDir = await mkdtemp(path.join(tmpdir(), "providers-bad-"));
    await writeFile(
      path.join(badDir, "US.json"),
      JSON.stringify([
        { name: "Broken", channel: "sms", source: "https://x" }, // no smsNumber
        { name: "Legacy", waNumber: "+15550001111", source: "https://x" }, // no channel field
      ]),
    );
    expect(await lookupProviderChat("Broken Inc", "US", undefined, badDir)).toBeNull();
    const legacy = await lookupProviderChat("Legacy Corp", "US", undefined, badDir);
    expect(legacy?.waNumber).toBe("+15550001111");
    expect(legacy?.channel).toBeUndefined(); // callers default this to whatsapp
  });
});
