import { describe, expect, it } from "vitest";
import {
  DEBOUNCE_MS_IMAGE,
  DEBOUNCE_MS_PDF,
  INITIAL_STATE,
  transition,
  type IntakeState,
} from "../src/intake-machine.js";

describe("intake machine", () => {
  it("greets on first text", () => {
    const { state, effects } = transition(INITIAL_STATE, { type: "text", text: "hi" });
    expect(state.phase).toBe("idle");
    expect(effects).toEqual([{ effect: "send_greeting" }]);
  });

  it("first media creates an invoice, acks page 1, arms the debounce", () => {
    const { state, effects } = transition(INITIAL_STATE, { type: "media", mediaKind: "image" });
    expect(state).toMatchObject({ phase: "collecting", pageCount: 1, collectSeq: 1 });
    expect(effects).toEqual([
      { effect: "create_invoice" },
      { effect: "attach_media" },
      { effect: "ack_page", pageNumber: 1, offerDone: true },
      { effect: "schedule_debounce", seq: 1, delayMs: DEBOUNCE_MS_IMAGE },
    ]);
  });

  it("a single PDF gets the short debounce", () => {
    const { effects } = transition(INITIAL_STATE, { type: "media", mediaKind: "document" });
    expect(effects).toContainEqual({ effect: "schedule_debounce", seq: 1, delayMs: DEBOUNCE_MS_PDF });
  });

  it("additional pages bump the seq so stale debounces no-op", () => {
    let s = transition(INITIAL_STATE, { type: "media", mediaKind: "image" }).state;
    s = transition(s, { type: "media", mediaKind: "image" }).state;
    expect(s).toMatchObject({ pageCount: 2, collectSeq: 2 });
    // Stale timer from page 1:
    expect(transition(s, { type: "debounce_expired", seq: 1 }).effects).toEqual([]);
    // Current timer fires:
    const fired = transition(s, { type: "debounce_expired", seq: 2 });
    expect(fired.state.phase).toBe("processing");
    expect(fired.effects).toEqual([{ effect: "send_processing_started" }, { effect: "start_processing" }]);
  });

  it("'that's all' button promotes to processing immediately", () => {
    const s = transition(INITIAL_STATE, { type: "media", mediaKind: "image" }).state;
    const done = transition(s, { type: "button", buttonId: "collect_done:INV1" });
    expect(done.state.phase).toBe("processing");
    expect(done.effects).toContainEqual({ effect: "start_processing" });
    // Debounce firing afterwards is a no-op (phase changed + seq bumped).
    expect(transition(done.state, { type: "debounce_expired", seq: 1 }).effects).toEqual([]);
  });

  it("processing outcomes settle the phase", () => {
    const processing: IntakeState = { phase: "processing", invoiceId: "i", pageCount: 1, collectSeq: 3 };
    expect(transition(processing, { type: "processing_delivered" }).state.phase).toBe("delivered");
    expect(transition(processing, { type: "processing_failed" }).state.phase).toBe("failed");
  });

  it("follow-up buttons only route in delivered phase", () => {
    const delivered: IntakeState = { phase: "delivered", invoiceId: "i", pageCount: 1, collectSeq: 3 };
    expect(transition(delivered, { type: "button", buttonId: "savings:i" }).effects).toEqual([
      { effect: "route_follow_up", buttonId: "savings:i" },
    ]);
    expect(transition(INITIAL_STATE, { type: "button", buttonId: "savings:i" }).effects).toEqual([]);
  });

  it("delete flow requires confirmation, in any language", () => {
    for (const word of ["delete", "borrar", "löschen", "apagar", "supprimer"]) {
      const ask = transition(INITIAL_STATE, { type: "text", text: word });
      expect(ask.state.phase).toBe("await_delete_confirm");
      expect(ask.effects).toEqual([{ effect: "ask_delete_confirm" }]);
      const yes = transition(ask.state, { type: "button", buttonId: "delete_yes" });
      expect(yes.effects).toEqual([{ effect: "execute_deletion" }]);
      expect(yes.state.phase).toBe("idle");
      const no = transition(ask.state, { type: "button", buttonId: "delete_no" });
      expect(no.effects).toEqual([{ effect: "send_delete_cancelled" }]);
    }
  });

  it("media in delivered phase starts a fresh bill", () => {
    const delivered: IntakeState = { phase: "delivered", invoiceId: "old", pageCount: 3, collectSeq: 9 };
    const { state, effects } = transition(delivered, { type: "media", mediaKind: "image" });
    expect(state).toMatchObject({ phase: "collecting", invoiceId: null, pageCount: 1 });
    expect(effects).toContainEqual({ effect: "create_invoice" });
  });
});
