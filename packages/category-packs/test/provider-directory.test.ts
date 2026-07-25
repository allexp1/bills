import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { lookupProviderWa } from "../src/providers/directory.js";

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

describe("lookupProviderWa", () => {
  it("matches the legal-noise names bills actually print", async () => {
    const hit = await lookupProviderWa("Vodafone España S.A.U.", "es", "mobile", dir);
    expect(hit?.waNumber).toBe("+34607100100");
  });

  it("matches aliases with diacritics normalized", async () => {
    const hit = await lookupProviderWa("TELEFONICA DE ESPAÑA", "ES", "mobile", dir);
    expect(hit?.waNumber).toBe("+34638101004");
  });

  it("respects the category scope of an entry", async () => {
    expect(await lookupProviderWa("Movistar", "ES", "energy", dir)).toBeNull();
  });

  it("null for unlisted providers, unknown countries, and missing inputs", async () => {
    expect(await lookupProviderWa("Endesa", "ES", "energy", dir)).toBeNull();
    expect(await lookupProviderWa("Vodafone", "DE", "mobile", dir)).toBeNull();
    expect(await lookupProviderWa(null, "ES", "mobile", dir)).toBeNull();
    expect(await lookupProviderWa("Vodafone", null, "mobile", dir)).toBeNull();
  });

  it("does not match on short/generic fragments", async () => {
    expect(await lookupProviderWa("Iberdrola Clientes S.A.U.", "ES", undefined, dir)).toBeNull();
  });

  it("finds the shipped ES directory from the package cwd", async () => {
    const hit = await lookupProviderWa("Orange Espagne S.A.U.", "ES", "broadband");
    expect(hit?.waNumber).toBe("+34653850085");
  });

  it("shipped directories parse and match across markets", async () => {
    expect((await lookupProviderWa("Iberdrola Clientes S.A.U.", "ES", "energy"))?.waNumber).toBe("+34601225235");
    expect((await lookupProviderWa("EDP Comercial", "PT", "energy"))?.waNumber).toBe("+351911955282");
    expect((await lookupProviderWa("Telekom Deutschland GmbH", "DE", "broadband"))?.waNumber).toBe("+4915142227878");
    expect((await lookupProviderWa("Telefônica Brasil S.A. (Vivo)", "BR", "mobile"))?.waNumber).toBe("+5511999151515");
    expect((await lookupProviderWa("Oi S.A.", "BR", "broadband"))?.waNumber).toBe("+553131313131");
    expect((await lookupProviderWa("AT&T Comunicaciones Digitales", "MX", "mobile"))?.waNumber).toBe("+525569329582");
    expect((await lookupProviderWa("EDF Energy Customers Ltd", "GB", "energy"))?.waNumber).toBe("+447782569959");
    // FR intentionally has no file — every lookup must be null, never a guess.
    expect(await lookupProviderWa("Orange France", "FR", "mobile")).toBeNull();
  });
});
