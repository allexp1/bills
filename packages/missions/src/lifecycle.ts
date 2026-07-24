import type { MissionStatus } from "@bills/shared";

/**
 * Phase 2 mission lifecycle. The engine may only move a mission along these
 * edges; anything else is a bug surfaced loudly.
 */
const TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  draft: ["awaiting_authorization", "cancelled"],
  awaiting_authorization: ["authorized", "cancelled"],
  authorized: ["queued", "cancelled"],
  queued: ["contacting_provider", "cancelled"],
  contacting_provider: ["in_progress", "failed", "escalated_human", "cancelled"],
  in_progress: [
    "awaiting_customer",
    "awaiting_provider",
    "pending_customer_completion",
    "completed",
    "failed",
    "escalated_human",
    "cancelled",
  ],
  awaiting_customer: ["in_progress", "cancelled", "escalated_human"],
  awaiting_provider: ["in_progress", "escalated_human", "failed", "cancelled"],
  pending_customer_completion: ["completed", "cancelled", "escalated_human"],
  completed: [],
  failed: [],
  cancelled: [],
  escalated_human: ["in_progress", "completed", "failed", "cancelled"],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: MissionStatus, to: MissionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal mission transition: ${from} → ${to}`);
  }
}

export const TERMINAL_STATUSES: ReadonlySet<MissionStatus> = new Set(["completed", "failed", "cancelled"]);

/**
 * A mission may not send a single provider message without a granted,
 * unexpired, unrevoked authorization. Enforced in code, not by the model.
 */
export interface AuthorizationCheck {
  grantedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export function authorizationActive(auth: AuthorizationCheck | null, now = new Date()): boolean {
  if (!auth?.grantedAt) return false;
  if (auth.revokedAt && auth.revokedAt <= now) return false;
  if (auth.expiresAt && auth.expiresAt <= now) return false;
  return true;
}
