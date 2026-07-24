import { z } from "zod";
import type { CategoryPack, SavingsLever } from "../../pack.js";
import { fieldMinor, savingVsOffer, verdictAgainst } from "../../validate-helpers.js";
import { resolvePath } from "../../paths.js";

export const MobileFieldsSchema = z.object({
  planName: z.string().nullable(),
  baseFee: z.string().nullable(),
  addOns: z.array(
    z.object({ label: z.string().nullable(), amount: z.string().nullable(), recurring: z.boolean().nullable() }),
  ),
  roamingCharges: z.string().nullable(),
  outOfBundleCharges: z.string().nullable(),
  lines: z.array(
    z.object({ msisdnMasked: z.string().nullable(), planName: z.string().nullable(), amount: z.string().nullable() }),
  ),
  contractEndDate: z.string().nullable(),
});
export type MobileFields = z.infer<typeof MobileFieldsSchema>;

const removeAddons: SavingsLever<MobileFields> = {
  id: "mobile_remove_addons",
  kind: "optimize_current",
  title: {
    en: "Cancel unused add-ons",
    es: "Cancelar servicios adicionales sin uso",
    fr: "Résilier les options inutilisées",
    pt: "Cancelar serviços extra não usados",
    de: "Ungenutzte Zusatzoptionen kündigen",
  },
  promptFragment:
    "For recurring add-ons, propose cancelling ones that look unused or duplicated. The saving is the SUM of the cited add-on amounts — cite each add-on's amount path individually.",
  applies: (f) => (f.addOns.length > 0 ? f.addOns.some((a) => a.recurring !== false && a.amount !== null) : null),
  validate: (claim, fields) => {
    // Recompute as the sum of every cited add-on amount path.
    let sum = 0;
    let cited = 0;
    for (const path of claim.basis.extractionPaths) {
      // Paths arrive rooted at the extraction ("category_fields.mobile.addOns.N.amount")
      // or at the pack fields; accept both by trying the suffix after "mobile.".
      const local = path.includes("mobile.") ? path.slice(path.indexOf("mobile.") + "mobile.".length) : path;
      const value = resolvePath(fields, local);
      const minor = fieldMinor(value, claim.currency);
      if (minor !== null) {
        sum += minor;
        cited++;
      }
    }
    if (cited === 0) return { verdict: "dropped", reason: "no cited add-on amounts resolved" };
    return verdictAgainst(claim, sum);
  },
  nextStep: (_f, common, locale) => {
    const provider = common.providerName ?? "";
    const steps: Record<string, string> = {
      en: `Reply "Act on this" and we'll ask ${provider} to remove them — or do it in the ${provider} app under add-ons/services.`,
      es: `Responde "Actuar" y pedimos a ${provider} que los quite — o hazlo en la app de ${provider}, en servicios contratados.`,
      fr: `Répondez « Agir » et nous demandons à ${provider} de les retirer — ou faites-le dans l'app ${provider}, rubrique options.`,
      pt: `Responda "Agir" e pedimos à ${provider} para os remover — ou faça-o na app da ${provider}, em serviços.`,
      de: `Antworten Sie "Handeln" und wir bitten ${provider} um die Kündigung — oder erledigen Sie es in der ${provider}-App unter Optionen.`,
    };
    return steps[locale] ?? steps.en!;
  },
};

const rightsizePlan: SavingsLever<MobileFields> = {
  id: "mobile_rightsize_plan",
  kind: "switch_provider",
  title: {
    en: "Move to a better-priced plan",
    es: "Cambiar a un plan mejor de precio",
    fr: "Passer à un forfait mieux tarifé",
    pt: "Mudar para um plano com melhor preço",
    de: "Zu einem günstigeren Tarif wechseln",
  },
  promptFragment:
    "If a comparison plan beats the current base fee, propose it citing the offer id. Without comparison data, describe the lever qualitatively — no number.",
  validate: (claim, fields, common, comparison) => {
    const current = fieldMinor(fields.baseFee ?? common.totalAmount, claim.currency);
    return verdictAgainst(claim, savingVsOffer(claim, current, comparison));
  },
  nextStep: (_f, _c, locale) => {
    const steps: Record<string, string> = {
      en: `Reply "Act on this" and we'll help with the switch — number portability keeps your number.`,
      es: `Responde "Actuar" y te ayudamos con el cambio: la portabilidad mantiene tu número.`,
      fr: `Répondez « Agir » et nous vous aidons — la portabilité conserve votre numéro.`,
      pt: `Responda "Agir" e ajudamos na mudança — a portabilidade mantém o seu número.`,
      de: `Antworten Sie "Handeln" und wir helfen beim Wechsel — Ihre Nummer nehmen Sie mit.`,
    };
    return steps[locale] ?? steps.en!;
  },
};

export const mobilePack: CategoryPack<MobileFields> = {
  id: "mobile",
  version: "0.1.0",
  displayName: { en: "Mobile", es: "Móvil", fr: "Mobile", pt: "Telemóvel", de: "Mobilfunk" },
  extractionSchema: MobileFieldsSchema,
  extractionHints: {
    addOns: "Recurring extra services billed on top of the plan (insurance, premium SMS, content subscriptions, cloud).",
    lines: "Multi-line/family bills: capture each line's masked number, plan and amount separately.",
    roamingCharges: "Charges incurred abroad, often a separate section.",
    "lines.msisdnMasked": "Mask all but the last 3 digits of any phone number you transcribe.",
  },
  decodeHints: {
    lineItemGlossary:
      "base fee = your plan's fixed monthly price; add-on = an extra recurring service, often signed up by accident; out-of-bundle = usage beyond your plan's allowance; premium SMS = third-party paid texts, a common silent drain.",
    gotchaChecks: [
      {
        id: "addon_creep",
        promptFragment: "List every recurring add-on with its amount and ask whether the customer actually uses it.",
        detect: (f) => (f.addOns.length > 0 ? f.addOns.filter((a) => a.recurring !== false).length >= 2 : null),
      },
      {
        id: "roaming_charges",
        promptFragment: "If roaming charges exist, explain them and mention roaming packs for future travel.",
        detect: (f) => (f.roamingCharges !== null ? true : null),
      },
      {
        id: "out_of_bundle",
        promptFragment: "If out-of-bundle charges exist, the plan allowance may be too small — a recurring pattern means the plan is mis-sized.",
        detect: (f) => (f.outOfBundleCharges !== null ? true : null),
      },
    ],
  },
  savingsLevers: [removeAddons, rightsizePlan],
};
