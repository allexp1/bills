/**
 * Renegotiation timing: leverage peaks when a promo or contract ends —
 * that's when providers budget for retention concessions. The daily cron
 * uses this to decide which delivered invoices deserve a nudge.
 */

export const REMINDER_WINDOW_DAYS = 10;

export interface ReminderCandidate {
  promoEndDate: string | null;
  contractEndDate: string | null;
}

/** The date that triggers the reminder (earliest of promo/contract end), or null. */
export function reminderDate(c: ReminderCandidate): string | null {
  const dates = [c.promoEndDate, c.contractEndDate].filter(
    (d): d is string => d !== null && /^\d{4}-\d{2}-\d{2}$/.test(d),
  );
  if (dates.length === 0) return null;
  return dates.sort()[0]!;
}

/** Due when the trigger date falls within [today, today + window]. Past dates never fire. */
export function reminderDue(c: ReminderCandidate, now: Date, windowDays = REMINDER_WINDOW_DAYS): boolean {
  const date = reminderDate(c);
  if (!date) return false;
  const trigger = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(now.toISOString().slice(0, 10) + "T00:00:00Z");
  return trigger >= today && trigger - today <= windowDays * 24 * 3600 * 1000;
}
