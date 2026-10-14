import { describe, expect, it } from "vitest";
import type { AvailabilityDay } from "../domain/schedule/availability";
import { cardStatus, formatHours, notionStudentUrl, weekDayLabel } from "./week-text";

const base = { status: "scheduled" as const, conflict: null, originalDate: "2026-10-19", date: "2026-10-19" };

describe("cardStatus (AC12)", () => {
  it("every state carries an icon and a text label", () => {
    const states = [
      cardStatus(base),
      cardStatus({ ...base, status: "cancelled" }),
      cardStatus({ ...base, status: "moved", originalDate: "2026-10-19", date: "2026-10-20" }),
      cardStatus({ ...base, conflict: "outside_availability" }),
      cardStatus({ ...base, conflict: "time_off" }),
    ];
    for (const badges of states) {
      expect(badges.length).toBeGreaterThan(0);
      for (const b of badges) {
        expect(b.icon.length).toBeGreaterThan(0);
        expect(b.label.length).toBeGreaterThan(0);
      }
    }
  });
  it("names the specific state", () => {
    expect(cardStatus({ ...base, status: "cancelled" }).map((b) => b.label)).toContain("Cancelled");
    expect(cardStatus({ ...base, status: "moved", originalDate: "2026-10-19", date: "2026-10-20" }).map((b) => b.label)).toContain("Moved from Mon Oct 19");
    expect(cardStatus({ ...base, conflict: "outside_availability" }).map((b) => b.label)).toContain("Outside hours");
    expect(cardStatus({ ...base, conflict: "time_off" }).map((b) => b.label)).toContain("Time off");
    expect(cardStatus({ ...base, conflict: "time_off" })[0].icon).toBe("⚠");
  });
});

describe("weekDayLabel (AC12)", () => {
  const day = (state: AvailabilityDay["state"], intervals: AvailabilityDay["intervals"] = []): AvailabilityDay => ({ date: "2026-10-19", state, intervals, availableMinutes: 0 });
  it("covers the three states", () => {
    expect(weekDayLabel(day("available", [{ start: "09:00", end: "14:00" }]))).toBe("Available 09:00-14:00");
    expect(weekDayLabel(day("unavailable"))).toBe("Unavailable");
    expect(weekDayLabel(day("not_entered"))).toBe("No availability entered");
  });
});

describe("formatHours and links", () => {
  it("formats hours and minutes", () => {
    expect(formatHours(240)).toBe("4 h");
    expect(formatHours(330)).toBe("5.5 h");
    expect(formatHours(45)).toBe("45 min");
    expect(formatHours(0)).toBe("0 h");
  });
  it("the Notion URL has no dashes", () => {
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    expect(notionStudentUrl(id)).toBe(`https://www.notion.so/${id.replaceAll("-", "")}`);
    expect(notionStudentUrl(id)).not.toContain("-");
  });
});
