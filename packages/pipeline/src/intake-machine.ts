import type { SupportedLocale } from "@bills/shared";

/**
 * Pure intake state machine. Transitions return the new state plus a list of
 * effects; the job route executes effects (send message, schedule debounce…)
 * so the machine itself stays fully unit-testable.
 */

export type IntakePhase =
  | "idle"
  | "collecting"
  | "processing"
  | "delivered"
  | "failed"
  | "await_delete_confirm";

export interface IntakeState {
  phase: IntakePhase;
  invoiceId: string | null;
  pageCount: number;
  /** Monotonic marker; the debounce callback no-ops unless it still matches. */
  collectSeq: number;
}

export const INITIAL_STATE: IntakeState = { phase: "idle", invoiceId: null, pageCount: 0, collectSeq: 0 };

export type IntakeEvent =
  | { type: "text"; text: string }
  | { type: "media"; mediaKind: "image" | "document" }
  | { type: "button"; buttonId: string }
  | { type: "debounce_expired"; seq: number }
  | { type: "processing_delivered" }
  | { type: "processing_failed" };

export type IntakeEffect =
  | { effect: "send_greeting" }
  | { effect: "send_unsupported_input" }
  | { effect: "create_invoice" }
  | { effect: "ack_page"; pageNumber: number; offerDone: boolean }
  | { effect: "attach_media" }
  | { effect: "schedule_debounce"; seq: number; delayMs: number }
  | { effect: "start_processing" }
  | { effect: "send_processing_started" }
  | { effect: "ask_delete_confirm" }
  | { effect: "execute_deletion" }
  | { effect: "send_delete_cancelled" }
  | { effect: "route_follow_up"; buttonId: string };

export interface Transition {
  state: IntakeState;
  effects: IntakeEffect[];
}

export const DEBOUNCE_MS_IMAGE = 45_000;
export const DEBOUNCE_MS_PDF = 15_000;

const DELETE_WORDS = new Set(["delete", "borrar", "eliminar", "supprimer", "apagar", "löschen", "loeschen"]);

export function isDeleteRequest(text: string): boolean {
  return DELETE_WORDS.has(text.trim().toLowerCase());
}

export function transition(state: IntakeState, event: IntakeEvent): Transition {
  switch (event.type) {
    case "text": {
      if (isDeleteRequest(event.text)) {
        return { state: { ...state, phase: "await_delete_confirm" }, effects: [{ effect: "ask_delete_confirm" }] };
      }
      if (state.phase === "idle" || state.phase === "delivered" || state.phase === "failed") {
        return { state: { ...state, phase: "idle" }, effects: [{ effect: "send_greeting" }] };
      }
      if (state.phase === "collecting") {
        // Free text while collecting: treat as "keep collecting", re-arm debounce.
        const seq = state.collectSeq + 1;
        return {
          state: { ...state, collectSeq: seq },
          effects: [{ effect: "schedule_debounce", seq, delayMs: DEBOUNCE_MS_IMAGE }],
        };
      }
      return { state, effects: [] };
    }

    case "media": {
      const delayMs = event.mediaKind === "document" ? DEBOUNCE_MS_PDF : DEBOUNCE_MS_IMAGE;
      if (state.phase === "collecting") {
        const pageCount = state.pageCount + 1;
        const seq = state.collectSeq + 1;
        return {
          state: { ...state, pageCount, collectSeq: seq },
          effects: [
            { effect: "attach_media" },
            { effect: "ack_page", pageNumber: pageCount, offerDone: true },
            { effect: "schedule_debounce", seq, delayMs },
          ],
        };
      }
      // Any non-collecting phase: a new bill starts a fresh invoice.
      const seq = state.collectSeq + 1;
      return {
        state: { phase: "collecting", invoiceId: null, pageCount: 1, collectSeq: seq },
        effects: [
          { effect: "create_invoice" },
          { effect: "attach_media" },
          { effect: "ack_page", pageNumber: 1, offerDone: true },
          { effect: "schedule_debounce", seq, delayMs },
        ],
      };
    }

    case "button": {
      const [action] = event.buttonId.split(":");
      if (state.phase === "await_delete_confirm") {
        if (action === "delete_yes") {
          return { state: { ...INITIAL_STATE }, effects: [{ effect: "execute_deletion" }] };
        }
        return { state: { ...state, phase: "idle" }, effects: [{ effect: "send_delete_cancelled" }] };
      }
      if (action === "collect_done" && state.phase === "collecting") {
        return {
          state: { ...state, phase: "processing", collectSeq: state.collectSeq + 1 },
          effects: [{ effect: "send_processing_started" }, { effect: "start_processing" }],
        };
      }
      if ((action === "explain" || action === "savings" || action === "act") && state.phase === "delivered") {
        return { state, effects: [{ effect: "route_follow_up", buttonId: event.buttonId }] };
      }
      return { state, effects: [] };
    }

    case "debounce_expired": {
      // Stale timers (older seq) or wrong phase: no-op.
      if (state.phase !== "collecting" || event.seq !== state.collectSeq) return { state, effects: [] };
      return {
        state: { ...state, phase: "processing" },
        effects: [{ effect: "send_processing_started" }, { effect: "start_processing" }],
      };
    }

    case "processing_delivered":
      return state.phase === "processing"
        ? { state: { ...state, phase: "delivered" }, effects: [] }
        : { state, effects: [] };

    case "processing_failed":
      return state.phase === "processing"
        ? { state: { ...state, phase: "failed" }, effects: [] }
        : { state, effects: [] };
  }
}

/** Greeting copy per locale (sent by the send_greeting effect). */
export const GREETINGS: Record<SupportedLocale, string> = {
  en: "Hi! 👋 Send me a photo or PDF of any recurring bill — energy, internet or mobile — and I'll explain exactly what you're paying for and how to pay less.",
  es: "¡Hola! 👋 Envíame una foto o PDF de cualquier factura recurrente (luz, gas, internet o móvil) y te explico exactamente qué pagas y cómo pagar menos.",
  fr: "Bonjour ! 👋 Envoyez-moi une photo ou un PDF d'une facture récurrente (énergie, internet ou mobile) et je vous explique ce que vous payez et comment payer moins.",
  pt: "Olá! 👋 Envie-me uma foto ou PDF de qualquer fatura recorrente (energia, internet ou telemóvel) e eu explico exatamente o que paga e como pagar menos.",
  de: "Hallo! 👋 Schicken Sie mir ein Foto oder PDF einer laufenden Rechnung (Energie, Internet oder Mobilfunk) und ich erkläre genau, wofür Sie zahlen und wie Sie sparen können.",
  he: "שלום! 👋 שלחו לי צילום או PDF של כל חשבון קבוע — חשמל, אינטרנט או סלולר — ואסביר בדיוק על מה אתם משלמים ואיך לשלם פחות.",
  ru: "Привет! 👋 Пришлите фото или PDF любого регулярного счёта — электричество, интернет или мобильная связь — и я объясню, за что именно вы платите и как платить меньше.",
  zh: "您好！👋 发送任意固定账单的照片或 PDF —— 电费、宽带或手机 —— 我会说明您到底在为什么付费，以及如何少付一些。",
};
