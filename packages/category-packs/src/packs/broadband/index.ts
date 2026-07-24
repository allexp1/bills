import { z } from "zod";
import type { CategoryPack, SavingsLever } from "../../pack.js";
import { fieldMinor, savingVsOffer, verdictAgainst } from "../../validate-helpers.js";

export const BroadbandFieldsSchema = z.object({
  planName: z.string().nullable(),
  monthlyPrice: z.string().nullable(),
  contractEndDate: z.string().nullable(),
  inContractPrice: z.string().nullable(),
  outOfContractPrice: z.string().nullable(),
  promoPrice: z.string().nullable(),
  promoEndDate: z.string().nullable(),
  speedTier: z.string().nullable(),
  equipmentFees: z.array(z.object({ label: z.string().nullable(), amount: z.string().nullable() })),
});
export type BroadbandFields = z.infer<typeof BroadbandFieldsSchema>;

const renegotiate: SavingsLever<BroadbandFields> = {
  id: "broadband_renegotiate",
  kind: "optimize_current",
  title: {
    en: "Renegotiate your out-of-contract price",
    es: "Renegociar el precio fuera de permanencia",
    fr: "Renégocier votre prix hors engagement",
    pt: "Renegociar o preço fora de fidelização",
    de: "Preis nach Vertragsende neu verhandeln",
  },
  promptFragment:
    "If the customer pays the out-of-contract price (or the contract has ended), the saving is out-of-contract price minus in-contract/new-customer price when both are extracted. Cite both paths.",
  applies: (f) => {
    if (f.outOfContractPrice !== null && f.inContractPrice !== null) return true;
    if (!f.contractEndDate) return null;
    const end = Date.parse(f.contractEndDate);
    return Number.isNaN(end) ? null : end < Date.now();
  },
  validate: (claim, fields) => {
    const out = fieldMinor(fields.outOfContractPrice ?? fields.monthlyPrice, claim.currency);
    const inC = fieldMinor(fields.inContractPrice ?? fields.promoPrice, claim.currency);
    if (out === null || inC === null) {
      return { verdict: "flagged", reason: "in/out-of-contract pair not both extracted" };
    }
    return verdictAgainst(claim, out - inC);
  },
  nextStep: (_f, common, locale) => {
    const provider = common.providerName ?? "";
    const steps: Record<string, string> = {
      en: `Reply "Act on this" and we'll contact ${provider} for you — or call them, say you're considering leaving, and ask for the new-customer price.`,
      es: `Responde "Actuar" y contactamos con ${provider} por ti — o llama, di que estás pensando en irte y pide el precio de nuevo cliente.`,
      fr: `Répondez « Agir » et nous contactons ${provider} pour vous — ou appelez-les et demandez le tarif nouveau client.`,
      pt: `Responda "Agir" e contactamos a ${provider} por si — ou ligue, diga que pondera sair e peça o preço de novo cliente.`,
      de: `Antworten Sie "Handeln" und wir kontaktieren ${provider} für Sie — oder rufen Sie an und fragen Sie nach dem Neukundenpreis.`,
    };
    return steps[locale] ?? steps.en!;
  },
};

const switchProvider: SavingsLever<BroadbandFields> = {
  id: "broadband_switch_provider",
  kind: "switch_provider",
  title: {
    en: "Switch broadband provider",
    es: "Cambiar de proveedor de internet",
    fr: "Changer de fournisseur internet",
    pt: "Mudar de fornecedor de internet",
    de: "Internetanbieter wechseln",
  },
  promptFragment:
    "If a comparison offer with comparable speed beats the current monthly price, propose switching, citing the offer id.",
  validate: (claim, fields, common, comparison) => {
    const current = fieldMinor(fields.monthlyPrice ?? common.totalAmount, claim.currency);
    return verdictAgainst(claim, savingVsOffer(claim, current, comparison));
  },
  nextStep: (_f, _c, locale) => {
    const steps: Record<string, string> = {
      en: `Reply "Act on this" to start the switch — the new provider usually handles the cancellation.`,
      es: `Responde "Actuar" para iniciar el cambio: el nuevo proveedor suele gestionar la baja.`,
      fr: `Répondez « Agir » pour lancer le changement — le nouveau fournisseur gère généralement la résiliation.`,
      pt: `Responda "Agir" para iniciar a mudança — o novo fornecedor normalmente trata do cancelamento.`,
      de: `Antworten Sie "Handeln", um den Wechsel zu starten — der neue Anbieter übernimmt meist die Kündigung.`,
    };
    return steps[locale] ?? steps.en!;
  },
};

export const broadbandPack: CategoryPack<BroadbandFields> = {
  id: "broadband",
  version: "0.1.0",
  displayName: { en: "Broadband", es: "Internet", fr: "Internet", pt: "Internet", de: "Internet" },
  extractionSchema: BroadbandFieldsSchema,
  extractionHints: {
    outOfContractPrice:
      "The standard price after any promo/contract period; often shown as 'then X/month' or in the small print.",
    promoEndDate: "When the introductory price ends. Often phrased as 'for the first N months'.",
    equipmentFees: "Router/set-top rental or line fees billed separately from the plan.",
  },
  decodeHints: {
    lineItemGlossary:
      "in-contract price = discounted price during your commitment; out-of-contract price = the higher default after it ends; equipment fee = monthly rental for the router/box, often removable.",
    gotchaChecks: [
      {
        id: "out_of_contract_jump",
        promptFragment:
          "If the contract has ended or ends within 30 days, warn about the price jump to the out-of-contract rate.",
        detect: (f) => {
          if (!f.contractEndDate) return null;
          const end = Date.parse(f.contractEndDate);
          if (Number.isNaN(end)) return null;
          return end - Date.now() < 30 * 24 * 3600 * 1000;
        },
      },
      {
        id: "promo_expiry",
        promptFragment: "If a promo price is active, state when it ends and what the price becomes.",
        detect: (f) => (f.promoPrice !== null ? true : null),
      },
      {
        id: "equipment_fee",
        promptFragment: "If equipment fees exist, note they're often waivable or avoidable with your own router.",
        detect: (f) => (f.equipmentFees.length > 0 ? f.equipmentFees.some((e) => e.amount !== null) : null),
      },
    ],
  },
  savingsLevers: [renegotiate, switchProvider],
};
