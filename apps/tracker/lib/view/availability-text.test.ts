import { describe, expect, it } from "vitest";
import { conflictReasonText, dayLabel, formatDayHeading } from "./availability-text";

describe("dayLabel (AC5)", () => {
  it("available lists every interval with a tick", () => {
    const l = dayLabel({ date: "2026-10-19", state: "available", intervals: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }], availableMinutes: 420 }, false);
    expect(l).toEqual({ icon: "✓", text: "Available 09:00-12:00, 13:00-17:00" });
  });
  it("unavailable and not entered have their own text and icon, never colour alone", () => {
    const u = dayLabel({ date: "2026-10-20", state: "unavailable", intervals: [], availableMinutes: 0 }, false);
    const n = dayLabel({ date: "2026-10-20", state: "not_entered", intervals: [], availableMinutes: 0 }, false);
    expect(u).toEqual({ icon: "✕", text: "Unavailable" });
    expect(n).toEqual({ icon: "○", text: "Not entered" });
    expect(new Set([u.icon, n.icon, "✓"]).size).toBe(3);
  });
  it("a day with time off is labelled Time off", () => {
    expect(dayLabel({ date: "2026-10-20", state: "unavailable", intervals: [], availableMinutes: 0 }, true).text).toBe("Time off");
    expect(dayLabel({ date: "2026-10-20", state: "available", intervals: [{ start: "09:00", end: "10:00" }], availableMinutes: 60 }, true).text)
      .toBe("Time off, available 09:00-10:00");
  });
});

describe("text helpers", () => {
  it("formats a heading like Mon Oct 19", () => expect(formatDayHeading("2026-10-19")).toBe("Mon Oct 19"));
  it("explains a conflict reason", () => {
    expect(conflictReasonText("time_off")).toBe("Time off");
    expect(conflictReasonText("outside_availability")).toBe("Outside available hours");
  });
});
