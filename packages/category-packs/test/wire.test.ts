import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  countUnionParameters,
  mergedExtractionSchema,
  mergedWireExtractionSchema,
  normalizeExtraction,
} from "../src/index.js";

describe("wire schema", () => {
  it("stays under the API limit of 16 union-typed parameters", () => {
    const domainUnions = countUnionParameters(mergedExtractionSchema());
    const wireUnions = countUnionParameters(mergedWireExtractionSchema());
    expect(domainUnions).toBeGreaterThan(16); // documents why the wire transform exists
    expect(wireUnions).toBeLessThanOrEqual(16);
  });

  it("wire schema accepts sentinel values and normalization restores nulls", () => {
    const wire = mergedWireExtractionSchema();
    const wireData = wire.parse({
      category: "mobile",
      category_confidence: 0.95,
      common: {
        providerName: "Movilinea",
        accountNumber: "", // sentinel: not visible
        customerRefName: "",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        issueDate: "",
        dueDate: "2026-07-12",
        totalAmount: "57,98",
        pastDueAmount: "",
        currency: "EUR",
        country: "ES",
        paymentMethod: "",
        printedNextSteps: [],
        lineItems: [
          { label: "Plan M", amount: "45,00", page: 1, rawNote: "" },
          { label: "Sello", amount: "", page: 0, rawNote: "" }, // page 0 = unknown
        ],
        billLanguage: "es",
      },
      category_fields: {
        energy: null,
        broadband: null,
        mobile: {
          planName: "Plan M",
          baseFee: "45,00",
          addOns: [{ label: "SMS Premium", amount: "9,99", recurring: "true" }],
          roamingCharges: "",
          outOfBundleCharges: "",
          lines: [],
          contractEndDate: "",
        },
      },
      field_confidence: {},
      pages_used: [1],
    });

    const domain = normalizeExtraction(wireData);
    expect(domain.common.accountNumber).toBeNull();
    expect(domain.common.pastDueAmount).toBeNull();
    expect(domain.common.totalAmount).toBe("57,98");
    expect(domain.common.lineItems[1]!.amount).toBeNull();
    expect(domain.common.lineItems[1]!.page).toBeNull();
    expect(domain.common.lineItems[0]!.page).toBe(1);
    const mobile = domain.category_fields.mobile as { addOns: Array<{ recurring: boolean | null }>; roamingCharges: string | null };
    expect(mobile.roamingCharges).toBeNull();
    expect(mobile.addOns[0]!.recurring).toBe(true);
    expect(domain.category_fields.energy).toBeNull();
  });

  it("nullable enums gain an unknown option on the wire and map back to null", () => {
    const wire = mergedWireExtractionSchema();
    const energyWire = wire.shape.category_fields.shape.energy;
    const parsed = (energyWire as z.ZodTypeAny).parse({
      energyType: "unknown",
      tariffName: "",
      unitRates: [],
      standingChargeDaily: "",
      usageKwh: "310",
      usageM3: "",
      meterReads: [{ readingDate: "2026-06-28", value: "48211", kind: "unknown" }],
      contractEndDate: "",
      exitFee: "",
      estimatedAnnualCost: "",
    });
    expect(parsed.energyType).toBe("unknown");

    const domain = normalizeExtraction({
      category: "energy",
      category_confidence: 0.9,
      common: {
        providerName: "X", accountNumber: "", customerRefName: "", billingPeriodStart: "", billingPeriodEnd: "",
        issueDate: "", dueDate: "", totalAmount: "10,00", pastDueAmount: "", currency: "EUR", country: "ES",
        paymentMethod: "", printedNextSteps: [], lineItems: [], billLanguage: "es",
      },
      category_fields: { energy: parsed, broadband: null, mobile: null },
      field_confidence: {},
      pages_used: [1],
    });
    const energy = domain.category_fields.energy as { energyType: string | null; meterReads: Array<{ kind: string | null }> };
    expect(energy.energyType).toBeNull();
    expect(energy.meterReads[0]!.kind).toBeNull();
  });
});
