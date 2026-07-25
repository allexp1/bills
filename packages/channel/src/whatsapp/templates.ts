import type { SupportedLocale } from "@bills/shared";
import type { TemplateName } from "../channel.js";

/**
 * Registry of pre-approved WhatsApp template messages. Templates are the only
 * messages allowed outside the 24-hour customer-service window; each must be
 * submitted for Meta approval per locale (approval takes days — submit early).
 *
 * The body text here is the source of truth for what gets submitted to Meta;
 * {{n}} placeholders map to the `params` array on sendTemplate.
 */
export interface TemplateDefinition {
  name: TemplateName;
  category: "UTILITY";
  bodies: Record<SupportedLocale, string>;
  paramCount: number;
}

export const TEMPLATES: Record<TemplateName, TemplateDefinition> = {
  bill_ready: {
    name: "bill_ready",
    category: "UTILITY",
    paramCount: 1,
    bodies: {
      en: "Your bill analysis is ready. Total this cycle: {{1}}. Reply here to see the breakdown and savings.",
      es: "Tu análisis de la factura está listo. Total de este ciclo: {{1}}. Responde aquí para ver el desglose y los ahorros.",
      fr: "L'analyse de votre facture est prête. Total de ce cycle : {{1}}. Répondez ici pour voir le détail et les économies.",
      pt: "A análise da sua fatura está pronta. Total deste ciclo: {{1}}. Responda aqui para ver os detalhes e as poupanças.",
      de: "Ihre Rechnungsanalyse ist fertig. Gesamtbetrag dieses Zyklus: {{1}}. Antworten Sie hier für Details und Sparmöglichkeiten.",
    },
  },
  savings_reminder: {
    name: "savings_reminder",
    category: "UTILITY",
    paramCount: 2,
    bodies: {
      en: "Reminder: you could save {{1}} on your {{2}} bill. Reply here to act on it.",
      es: "Recordatorio: podrías ahorrar {{1}} en tu factura de {{2}}. Responde aquí para actuar.",
      fr: "Rappel : vous pourriez économiser {{1}} sur votre facture {{2}}. Répondez ici pour agir.",
      pt: "Lembrete: pode poupar {{1}} na sua fatura de {{2}}. Responda aqui para agir.",
      de: "Erinnerung: Sie könnten {{1}} bei Ihrer {{2}}-Rechnung sparen. Antworten Sie hier, um zu handeln.",
    },
  },
  promo_expiry: {
    name: "promo_expiry",
    category: "UTILITY",
    paramCount: 2,
    bodies: {
      en: "Your promotional price with {{1}} ends around {{2}} — this is when your negotiating leverage peaks. Reply here and we'll prepare your pitch.",
      es: "Tu precio promocional con {{1}} termina hacia el {{2}} — es cuando más fuerza tienes para negociar. Responde aquí y preparamos tu propuesta.",
      fr: "Votre prix promotionnel chez {{1}} se termine vers le {{2}} — c'est le moment où votre pouvoir de négociation est maximal. Répondez ici et nous préparons votre argumentaire.",
      pt: "O seu preço promocional com {{1}} termina por volta de {{2}} — é quando tem mais força para negociar. Responda aqui e preparamos a sua proposta.",
      de: "Ihr Aktionspreis bei {{1}} endet um den {{2}} — jetzt ist Ihre Verhandlungsposition am stärksten. Antworten Sie hier und wir bereiten Ihren Vorschlag vor.",
    },
  },
  mission_update: {
    name: "mission_update",
    category: "UTILITY",
    paramCount: 1,
    bodies: {
      en: "Update on your request: {{1}}. Reply here for details.",
      es: "Novedades sobre tu solicitud: {{1}}. Responde aquí para más detalles.",
      fr: "Mise à jour de votre demande : {{1}}. Répondez ici pour plus de détails.",
      pt: "Atualização do seu pedido: {{1}}. Responda aqui para mais detalhes.",
      de: "Neuigkeiten zu Ihrem Anliegen: {{1}}. Antworten Sie hier für Details.",
    },
  },
};

/** Meta language tags for our locales (templates are registered under these). */
export function templateLocaleTag(locale: SupportedLocale): string {
  const map: Record<SupportedLocale, string> = {
    en: "en",
    es: "es",
    fr: "fr",
    pt: "pt_PT",
    de: "de",
  };
  return map[locale];
}
