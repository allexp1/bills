import { z } from "zod";
import type { CategoryPack, SavingsLever } from "../../pack.js";
import { fieldMinor, savingVsOffer, verdictAgainst } from "../../validate-helpers.js";
import { resolvePath } from "../../paths.js";

export const MobileFieldsSchema = z.object({
  planName: z.string().nullable(),
  baseFee: z.string().nullable(),
  /** Plan data allowance as printed ("800 GB", "unlimited") — usage sections are gold for right-sizing. */
  dataAllowanceGb: z.string().nullable(),
  /** Data actually used this cycle as printed ("102,4 GB"). */
  dataUsedGb: z.string().nullable(),
  minutesIncluded: z.string().nullable(),
  minutesUsed: z.string().nullable(),
  addOns: z.array(
    z.object({ label: z.string().nullable(), amount: z.string().nullable(), recurring: z.boolean().nullable() }),
  ),
  roamingCharges: z.string().nullable(),
  outOfBundleCharges: z.string().nullable(),
  lines: z.array(
    z.object({
      msisdnMasked: z.string().nullable(),
      planName: z.string().nullable(),
      amount: z.string().nullable(),
      dataUsedGb: z.string().nullable(),
    }),
  ),
  contractEndDate: z.string().nullable(),
});
export type MobileFields = z.infer<typeof MobileFieldsSchema>;

/** Parse a printed data quantity: "102,4 GB" → 102.4; unlimited → Infinity; unparseable → null. */
export function parseGb(printed: string | null): number | null {
  if (!printed) return null;
  if (/unlim|ilimitad|illimit|unbegrenzt|sin l[ií]mite/i.test(printed)) return Infinity;
  const m = printed.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return m ? Number.parseFloat(m[0]) : null;
}

/** used/allowance when both are known and allowance is finite; null otherwise. */
function utilization(f: MobileFields): number | null {
  const used = parseGb(f.dataUsedGb);
  const allowance = parseGb(f.dataAllowanceGb);
  if (used === null || allowance === null || !Number.isFinite(allowance) || allowance <= 0) return null;
  return used / allowance;
}

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

const lowerTier: SavingsLever<MobileFields> = {
  id: "mobile_lower_tier",
  kind: "optimize_current",
  title: {
    en: "Move down to a plan that fits your real usage",
    es: "Bajar a un plan acorde a tu uso real",
    fr: "Passer à un forfait adapté à votre usage réel",
    pt: "Descer para um plano ajustado ao seu uso real",
    de: "In einen Tarif wechseln, der zur echten Nutzung passt",
  },
  promptFragment:
    "When usage data shows the customer uses far less than the plan allowance (e.g. 100 GB used of 800 GB), propose moving DOWN a tier with the CURRENT provider: a plan covering ~1.5-2x actual usage. This is the provider's own data about the customer — the strongest possible evidence; cite the dataUsedGb and dataAllowanceGb paths. Only attach a number if a concrete cheaper plan price exists in the data (a comparison offer with adequate allowance, or a smaller tier printed on the bill); otherwise describe the move qualitatively with the exact GB figures and no invented price.",
  applies: (f) => {
    const u = utilization(f);
    return u === null ? null : u < 0.5;
  },
  validate: (claim, fields, common, comparison) => {
    if (!claim.basis.comparisonOfferId) {
      return { verdict: "flagged", reason: "no priced smaller tier in data — qualitative only" };
    }
    const current = fieldMinor(fields.baseFee ?? common.totalAmount, claim.currency);
    return verdictAgainst(claim, savingVsOffer(claim, current, comparison));
  },
  nextStep: (f, common, locale) => {
    const provider = common.providerName ?? "";
    const used = f.dataUsedGb ?? "?";
    const allowance = f.dataAllowanceGb ?? "?";
    const steps: Record<string, string> = {
      en: `You used ${used} of your ${allowance} allowance. Ask ${provider} which smaller plans cover your real usage — don't name a price, let them list the tiers.`,
      es: `Usaste ${used} de tu bono de ${allowance}. Pregunta a ${provider} qué planes inferiores cubren tu uso real — no digas un precio, deja que enumeren los tramos.`,
      fr: `Vous avez utilisé ${used} sur ${allowance}. Demandez à ${provider} quels forfaits inférieurs couvrent votre usage réel — sans annoncer de prix, laissez-les lister les paliers.`,
      pt: `Usou ${used} do seu plafond de ${allowance}. Pergunte à ${provider} que planos inferiores cobrem o seu uso real — não diga um preço, deixe-os listar os escalões.`,
      de: `Sie haben ${used} von ${allowance} verbraucht. Fragen Sie ${provider}, welche kleineren Tarife Ihre echte Nutzung abdecken — nennen Sie keinen Preis, lassen Sie sich die Stufen auflisten.`,
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
    "If a comparison plan beats the current base fee, propose it citing the offer id — but ONLY when the offer's known conditions cover the customer's actual usage (allowance comfortably above dataUsedGb). Without comparison data, describe the lever qualitatively — no number.",
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
  version: "0.2.0",
  displayName: { en: "Mobile", es: "Móvil", fr: "Mobile", pt: "Telemóvel", de: "Mobilfunk" },
  extractionSchema: MobileFieldsSchema,
  extractionHints: {
    addOns: "Recurring extra services billed on top of the plan (insurance, premium SMS, content subscriptions, cloud).",
    lines: "Multi-line/family bills: capture each line's masked number, plan and amount separately.",
    roamingCharges: "Charges incurred abroad, often a separate section.",
    "lines.msisdnMasked": "Mask all but the last 3 digits of any phone number you transcribe.",
    dataAllowanceGb:
      "The plan's data allowance as printed. Usage sections are often labelled 'consumo/uso de datos', 'consommation', 'Datenverbrauch', 'utilização'. Write 'unlimited' if that's what the bill says.",
    dataUsedGb: "Data actually consumed this billing cycle, exactly as printed (e.g. '102,4 GB').",
    minutesIncluded: "Included call minutes as printed ('unlimited' allowed).",
    minutesUsed: "Minutes actually used this cycle, if the bill shows them.",
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
      {
        id: "oversized_plan",
        promptFragment:
          "The customer uses a small fraction of the plan's data allowance — they're paying for capacity they never touch. State the exact used-vs-allowance figures from the bill; this is the provider's own data and the strongest possible saving evidence.",
        detect: (f) => {
          const u = utilization(f);
          return u === null ? null : u < 0.35;
        },
      },
    ],
  },
  savingsLevers: [removeAddons, lowerTier, rightsizePlan],
};
