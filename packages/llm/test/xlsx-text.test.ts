import { describe, expect, it } from "vitest";
import { isSpreadsheet, spreadsheetToText, xlsxToText } from "../src/xlsx-text.js";

/**
 * A real (tiny) xlsx, structured like Har haBituach's export: shared strings
 * with Hebrew, a rich-text run split across two <t> elements, a header row
 * with a skipped column, and a numeric premium cell. Embedded as base64 so
 * the test exercises the actual zip + inflate + XML path, not a mock.
 */
const FIXTURE_B64 =
  "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";

describe("xlsxToText", () => {
  const buf = Buffer.from(FIXTURE_B64, "base64");

  it("flattens a workbook to pipe-separated rows, Hebrew intact", () => {
    const text = xlsxToText(buf);
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    // Rich-text run split across two <t> elements comes back as one string.
    expect(lines[1]).toContain("מנורה ביטוח");
    expect(lines[1]).toContain("ביטוח בריאות");
    expect(lines[1]).toContain("446.61");
  });

  it("pads skipped columns so headers stay aligned with data", () => {
    // Header row has A, B, D — C is absent and must appear as an empty cell,
    // otherwise every value after the gap shifts one column left.
    const header = xlsxToText(buf).split("\n")[0]!;
    expect(header.split(" | ")).toEqual(["ענף ראשי", "חברה", "", 'פרמיה בש"ח']);
  });

  it("handles namespace-prefixed SpreadsheetML and self-closing empty cells", () => {
    /* The shape the REAL Har haBituach export has and the first fixture did
       not: every element prefixed (<x:row>, <x:t>) — .NET generators write
       it this way — plus a self-closing styled empty cell between two value
       cells, which a lazy regex would let swallow its neighbour's value. */
    const prefixed = Buffer.from(
      "UEsDBBQAAAAIANmNB13HHBc8CgAAAAgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLMJqSxILda3AwBQSwMEFAAAAAgA2Y0HXWY8R12LAAAAtQAAABQAAAB4bC9zaGFyZWRTdHJpbmdzLnhtbFWOTQrCMBBGrxJygE514aL05yxBRxNofsgEyTUEpboRl95ormNSQXDzweM9humnbGdxxkjGu0FumlZOY587oiSKcdTlQeqUQgdAe41WUeMDuuKOPlqVCsYTUIioDqQRk51h27Y7sMo4uZ4yddPIC1/4zdceKtX9mp9/8otvtRAlfPC9wPIfw/rY+AFQSwMEFAAAAAgA2Y0HXbGkQfGdAAAA/gAAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxVT0kOgzAM/ErkB2CIEAdEqLp8JKJpQSUJsiPg+U2iCtGL7ZnxeOkuu53Faogn7xRURQmXvtvbzdOHR2OCiLrjdlcwhrC0iDyMxmou/GJc1F6erA4R0ht5IaOf2WZnlGXZoNWTgzQwsw8ddALkN0EKZFaGVF4liKCAM7P2VYcppTgcPbfYw/FGwIO6y5+hrpui+Xdh3pPzaTmefuu/UEsBAhQDFAAAAAgA2Y0HXcccFzwKAAAACAAAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACADZjQddZjxHXYsAAAC1AAAAFAAAAAAAAAAAAAAAgAE7AAAAeGwvc2hhcmVkU3RyaW5ncy54bWxQSwECFAMUAAAACADZjQddsaRB8Z0AAAD+AAAAGAAAAAAAAAAAAAAAgAH4AAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsFBgAAAAADAAMAyQAAAMsBAAAAAA==",
      "base64",
    );
    // The empty B2 must stay an empty column; 446.61 must remain in C, not
    // be stolen into B by the self-closing cell's regex match.
    expect(xlsxToText(prefixed)).toBe("מנורה ביטוח |  | 446.61");
  });

  it("throws on bytes that are not a workbook, rather than feeding the model noise", () => {
    expect(() => xlsxToText(Buffer.from("not a zip at all"))).toThrow("not_a_zip");
  });
});

describe("spreadsheet routing", () => {
  it("recognises xlsx and csv, and nothing else", () => {
    expect(isSpreadsheet("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    expect(isSpreadsheet("text/csv")).toBe(true);
    expect(isSpreadsheet("application/pdf")).toBe(false);
    expect(isSpreadsheet("image/jpeg")).toBe(false);
  });

  it("passes csv through as text", () => {
    expect(spreadsheetToText(Buffer.from("a,b\n1,2"), "text/csv")).toBe("a,b\n1,2");
  });
});
