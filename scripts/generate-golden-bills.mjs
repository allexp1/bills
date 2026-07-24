#!/usr/bin/env node
/**
 * Generate synthetic single-page PDF bills (no dependencies — raw PDF syntax,
 * Helvetica text only) plus their expected-extraction JSON. Real anonymized
 * bills should be added alongside these; synthetic ones keep the golden suite
 * runnable from a fresh clone.
 *
 * Usage: node scripts/generate-golden-bills.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function pdfFromLines(lines) {
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 780 Td",
    "14 TL",
    ...lines.map((l) => `(${l.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj T*`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefPos = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const bills = [
  {
    category: "energy",
    name: "bill-001",
    lines: [
      "IBERLUZ ENERGIA S.A.                     Factura de electricidad",
      "",
      "Titular: Ana G.            Contrato n: 78-334455",
      "Periodo de facturacion: 01/06/2026 - 30/06/2026",
      "Fecha de emision: 01/07/2026    Vencimiento: 15/07/2026",
      "",
      "Tarifa: Plan Estable 12M   (fin de contrato: 31/01/2027)",
      "",
      "Termino de energia   310 kWh x 0,14 EUR/kWh          43,40 EUR",
      "Termino fijo         30 dias x 0,32 EUR/dia           9,60 EUR",
      "Alquiler contador                                     0,80 EUR",
      "Impuesto electricidad                                 2,75 EUR",
      "IVA 21%                                              11,88 EUR",
      "",
      "TOTAL FACTURA                                        68,43 EUR",
      "",
      "Lectura anterior: 47901 (E) estimada  28/05/2026",
      "Lectura actual:   48211 (E) estimada  28/06/2026",
      "",
      "Su tarifa Plan Estable termina el 31/01/2027. Para cambiar de",
      "tarifa sin permanencia visite iberluz.example/tarifas",
    ],
    expected: {
      category: "energy",
      common: { currency: "EUR", totalAmount: 6843, dueDate: "2026-07-15", providerContains: "IBERLUZ" },
      fields: { hasEstimatedRead: true, contractEndDate: "2027-01-31" },
    },
  },
  {
    category: "broadband",
    name: "bill-001",
    lines: [
      "FIBRACOM                                Factura internet",
      "",
      "Cliente: Ana G.        Cuenta: FC-99887",
      "Periodo: 01/06/2026 - 30/06/2026   Emision: 01/07/2026",
      "Cargo el 10/07/2026",
      "",
      "Fibra 600Mb  (precio promocional hasta 31/08/2026)   34,90 EUR",
      "  Despues de la promocion: 54,90 EUR/mes",
      "Alquiler router                                       3,00 EUR",
      "IVA 21%                                               7,96 EUR",
      "",
      "TOTAL                                                45,86 EUR",
      "",
      "Su permanencia finaliza el 31/08/2026.",
      "Para cancelar llame al 1449 o visite fibracom.example/baja",
    ],
    expected: {
      category: "broadband",
      common: { currency: "EUR", totalAmount: 4586, providerContains: "FIBRACOM" },
      fields: { promoEndDate: "2026-08-31", outOfContractMonthly: 5490 },
    },
  },
  {
    category: "mobile",
    name: "bill-001",
    lines: [
      "MOVILINEA                              Factura movil",
      "",
      "Cliente: Ana G.       Cuenta: MV-4455",
      "Periodo: 01/06/2026 - 30/06/2026   Vencimiento: 12/07/2026",
      "",
      "Plan M ilimitado                                     45,00 EUR",
      "SMS Premium (suscripcion)                             9,99 EUR",
      "Cloud 100GB (suscripcion)                             2,99 EUR",
      "IVA incluido en todos los importes",
      "",
      "TOTAL                                                57,98 EUR",
      "",
      "Gestione sus servicios adicionales en la app Movilinea,",
      "seccion Servicios contratados.",
    ],
    expected: {
      category: "mobile",
      common: { currency: "EUR", totalAmount: 5798, providerContains: "MOVILINEA" },
      fields: { addOnCount: 2, addOnsTotal: 1298 },
    },
  },
];

const base = path.resolve(process.cwd(), "fixtures/golden-bills");
for (const bill of bills) {
  const dir = path.join(base, bill.category);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${bill.name}.pdf`), pdfFromLines(bill.lines));
  writeFileSync(path.join(dir, `${bill.name}.expected.json`), JSON.stringify(bill.expected, null, 2) + "\n");
  console.log(`wrote ${bill.category}/${bill.name}.pdf`);
}
