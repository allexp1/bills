import { describe, expect, it } from "vitest";
import { reminderDate, reminderDue } from "../src/reminders.js";

describe("renegotiation reminders", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  it("fires inside the window, earliest date wins", () => {
    expect(reminderDue({ promoEndDate: "2026-07-30", contractEndDate: null }, now)).toBe(true);
    expect(reminderDue({ promoEndDate: null, contractEndDate: "2026-08-04" }, now)).toBe(true);
    expect(reminderDate({ promoEndDate: "2026-09-01", contractEndDate: "2026-07-28" })).toBe("2026-07-28");
  });

  it("never fires for past dates, far-future dates, or missing dates", () => {
    expect(reminderDue({ promoEndDate: "2026-07-24", contractEndDate: null }, now)).toBe(false);
    expect(reminderDue({ promoEndDate: "2026-09-01", contractEndDate: null }, now)).toBe(false);
    expect(reminderDue({ promoEndDate: null, contractEndDate: null }, now)).toBe(false);
    expect(reminderDue({ promoEndDate: "promo ends soon", contractEndDate: null }, now)).toBe(false);
  });

  it("today counts as due", () => {
    expect(reminderDue({ promoEndDate: "2026-07-25", contractEndDate: null }, now)).toBe(true);
  });
});
