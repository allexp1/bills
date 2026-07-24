import { z } from "zod";
import type { CategoryPack, SavingsLever } from "../../pack.js";
import { fieldMinor, savingVsOffer, verdictAgainst } from "../../validate-helpers.js";

export const EnergyFieldsSchema = z.object({
  energyType: z.enum(["electricity", "gas", "dual"]).nullable(),
  tariffName: z.string().nullable(),
  /** €/kWh etc., decimal string per rate band as printed. */
  unitRates: z.array(
    z.object({ band: z.string().nullable(), ratePerUnit: z.string().nullable(), unit: z.string().nullable() }),
  ),
  standingChargeDaily: z.string().nullable(),
  usageKwh: z.string().nullable(),
  usageM3: z.string().nullable(),
  meterReads: z.array(
    z.object({
      readingDate: z.string().nullable(),
      value: z.string().nullable(),
      kind: z.enum(["actual", "estimated", "customer"]).nullable(),
    }),
  ),
  contractEndDate: z.string().nullable(),
  exitFee: z.string().nullable(),
  estimatedAnnualCost: z.string().nullable(),
});
export type EnergyFields = z.infer<typeof EnergyFieldsSchema>;

const switchTariff: SavingsLever<EnergyFields> = {
  id: "energy_switch_tariff",
  kind: "switch_provider",
  title: {
    en: "Switch to a cheaper tariff",
    es: "Cambiar a una tarifa más barata",
    fr: "Passer à un tarif moins cher",
    pt: "Mudar para uma tarifa mais barata",
    de: "Zu einem günstigeren Tarif wechseln",
  },
  promptFragment:
    "If a comparison offer beats the customer's current monthly cost, propose switching. Cite the offer id. Mention the exit fee if one was extracted.",
  applies: (f) => (f.contractEndDate !== null || f.exitFee === null ? true : null),
  validate: (claim, fields, common, comparison) => {
    const currency = claim.currency;
    // Current monthly cost: total for the billing period as the best proxy.
    const current = fieldMinor(common.totalAmount, currency);
    return verdictAgainst(claim, savingVsOffer(claim, current, comparison));
  },
  nextStep: (_f, common, locale) => {
    const provider = common.providerName ?? "";
    const steps: Record<string, string> = {
      en: `Reply "Act on this" and we'll help you start the switch, or contact ${provider} to ask for your final meter reading first.`,
      es: `Responde "Actuar" y te ayudamos a iniciar el cambio, o contacta con ${provider} para pedir primero tu lectura final.`,
      fr: `Répondez « Agir » et nous vous aiderons à lancer le changement, ou contactez ${provider} pour demander d'abord votre relevé final.`,
      pt: `Responda "Agir" e ajudamos a iniciar a mudança, ou contacte a ${provider} para pedir primeiro a leitura final.`,
      de: `Antworten Sie "Handeln" und wir helfen beim Wechsel, oder kontaktieren Sie ${provider} für Ihren letzten Zählerstand.`,
    };
    return steps[locale] ?? steps.en!;
  },
};

const actualMeterRead: SavingsLever<EnergyFields> = {
  id: "energy_submit_actual_read",
  kind: "optimize_current",
  title: {
    en: "Submit an actual meter reading",
    es: "Enviar una lectura real del contador",
    fr: "Transmettre un relevé réel du compteur",
    pt: "Enviar uma leitura real do contador",
    de: "Echten Zählerstand übermitteln",
  },
  promptFragment:
    "If any meter read is estimated, explain that the bill is based on a guess and submitting a real reading corrects over-billing. Do NOT invent a saving amount — this lever has no groundable number unless the bill itself shows an estimation adjustment.",
  applies: (f) => (f.meterReads.length ? f.meterReads.some((r) => r.kind === "estimated") : null),
  validate: (claim) =>
    claim.estimatedSavingMinor > 0
      ? { verdict: "flagged", reason: "estimated-read correction has no derivable amount" }
      : { verdict: "flagged", reason: "qualitative lever" },
  nextStep: (_f, common, locale) => {
    const provider = common.providerName ?? "";
    const steps: Record<string, string> = {
      en: `Read your meter today and submit it via ${provider}'s app or website — your next bill will use real usage.`,
      es: `Lee tu contador hoy y envíalo por la app o web de ${provider}: tu próxima factura usará el consumo real.`,
      fr: `Relevez votre compteur aujourd'hui et transmettez-le via l'app ou le site de ${provider}.`,
      pt: `Leia o contador hoje e envie pela app ou site da ${provider} — a próxima fatura usará o consumo real.`,
      de: `Lesen Sie heute Ihren Zähler ab und übermitteln Sie den Stand über die App oder Website von ${provider}.`,
    };
    return steps[locale] ?? steps.en!;
  },
};

export const energyPack: CategoryPack<EnergyFields> = {
  id: "energy",
  version: "0.1.0",
  displayName: { en: "Energy", es: "Energía", fr: "Énergie", pt: "Energia", de: "Energie" },
  extractionSchema: EnergyFieldsSchema,
  extractionHints: {
    "meterReads.kind":
      "Bills mark reads as estimated vs actual with letters like E/A (en), E/R (es lectura estimada/real), (E) geschätzt (de). Capture the flag for every read.",
    unitRates: "Capture every rate band separately (peak/off-peak, day/night) with its unit (kWh, m³).",
    standingChargeDaily: "Daily fixed charge regardless of usage; may be called standing charge, término fijo, abonnement, Grundpreis.",
    contractEndDate: "Look for tariff or contract end dates, often in small print or a 'your tariff' box.",
    exitFee: "Early-termination or exit fee if printed.",
  },
  decodeHints: {
    lineItemGlossary:
      "standing charge = fixed daily amount you pay even with zero usage; unit rate = price per kWh; estimated read = the provider guessed your usage; regulated levies/taxes are pass-through and not negotiable.",
    gotchaChecks: [
      {
        id: "estimated_reads",
        promptFragment:
          "If any read is estimated, call it out: the bill may not reflect real usage and can be corrected with an actual reading.",
        detect: (f) => (f.meterReads.length ? f.meterReads.some((r) => r.kind === "estimated") : null),
      },
      {
        id: "contract_end_near",
        promptFragment:
          "If the contract/tariff end date is within 60 days (or past), warn that prices typically jump onto a default tariff afterwards.",
        detect: (f) => {
          if (!f.contractEndDate) return null;
          const end = Date.parse(f.contractEndDate);
          if (Number.isNaN(end)) return null;
          return end - Date.now() < 60 * 24 * 3600 * 1000;
        },
      },
      {
        id: "exit_fee",
        promptFragment: "If an exit fee exists, state it plainly so switching math is honest.",
        detect: (f) => (f.exitFee !== null ? true : null),
      },
    ],
  },
  savingsLevers: [switchTariff, actualMeterRead],
};
