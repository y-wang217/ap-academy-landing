import { describe, expect, it } from "vitest";
import type { CalendarClass, ClassState } from "../domain/schedule/month";
import { PURPOSE_LABEL, STATE_LABEL, STATE_TONE, cellLabel, clock, dayDots, dayLabel, makeupNote, monthLabel, movedNote, oneOffLabel, summaryLine, teacherFirstName } from "./calendar-text";

const cls = (startTime: string, state: ClassState, over: Partial<CalendarClass> = {}): CalendarClass => ({
  key: `k-${startTime}`, date: "2026-10-13", startTime, endTime: "23:00", subject: "MHF4U",
  staffId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", state, original: null, past: false, makeupFor: null, ...over,
});

describe("summaryLine (AC4, REQ-31 AC2)", () => {
  it("plural, singular and empty, with past instead of done", () => {
    expect(summaryLine({ total: 8, past: 2, upcoming: 6 })).toBe("8 classes this month · 2 past · 6 upcoming");
    expect(summaryLine({ total: 1, past: 0, upcoming: 1 })).toBe("1 class this month · 0 past · 1 upcoming");
    expect(summaryLine({ total: 0, past: 0, upcoming: 0 })).toBe("No classes this month.");
  });
});

describe("makeupNote (REQ-31 AC7)", () => {
  it("names the replaced class's date", () => {
    expect(makeupNote(cls("15:00", "makeup", { makeupFor: "2026-10-13" }))).toBe("Makeup for Tue Oct 13");
  });
  it("is empty without a link", () => {
    expect(makeupNote(cls("15:00", "makeup"))).toBe("");
    expect(makeupNote(cls("15:00", "scheduled"))).toBe("");
  });
});

describe("one-off words (REQ-31 AC4, AC6)", () => {
  it("purpose words, and Class when none is set", () => {
    expect(PURPOSE_LABEL).toEqual({ makeup: "Makeup", trial: "Trial", extra: "Extra" });
    expect(oneOffLabel(null)).toBe("Class");
    expect(oneOffLabel("makeup")).toBe("Makeup");
    expect(oneOffLabel("trial")).toBe("Trial");
    expect(oneOffLabel("extra")).toBe("Extra");
  });
});

describe("movedNote (AC5)", () => {
  it("names only the weekday in the same Sunday week", () => {
    expect(movedNote(cls("16:00", "moved", { date: "2026-10-15", original: { date: "2026-10-13", startTime: "17:30" } }))).toBe("Moved from Tue 5:30 PM");
  });
  it("names the date in another week", () => {
    expect(movedNote(cls("16:00", "moved", { date: "2026-10-19", original: { date: "2026-10-13", startTime: "17:30" } }))).toBe("Moved from Tue Oct 13, 5:30 PM");
  });
  it("is empty without an original", () => {
    expect(movedNote(cls("16:00", "scheduled"))).toBe("");
  });
});

describe("labels", () => {
  it("clock is 12h", () => {
    expect(clock("12:00")).toBe("12:00 PM");
    expect(clock("00:00")).toBe("12:00 AM");
    expect(clock("17:30")).toBe("5:30 PM");
    expect(clock("09:05")).toBe("9:05 AM");
  });
  it("month and day labels", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(dayLabel("2026-10-13")).toBe("Tue Oct 13");
  });
  it("teacherFirstName keeps an honorific (AC11)", () => {
    expect(teacherFirstName("Mr. Charlie Wang")).toBe("Mr. Charlie");
    expect(teacherFirstName("Ryan Test")).toBe("Ryan");
  });
  it("every state has a word", () => {
    expect(STATE_LABEL).toEqual({
      scheduled: "Scheduled", moved: "Moved", cancelled: "Cancelled",
      makeup: "Makeup", trial: "Trial", extra: "Extra", class: "Class",
    });
  });
  it("the one-off states share the neutral tone (REQ-31 AC6)", () => {
    expect(STATE_TONE).toEqual({
      scheduled: "ok", moved: "warn", cancelled: "error",
      makeup: "neutral", trial: "neutral", extra: "neutral", class: "neutral",
    });
  });
});

describe("dayDots and cellLabel (AC7)", () => {
  it("two classes give two dots and nothing more", () => {
    expect(dayDots([cls("17:00", "cancelled"), cls("15:00", "scheduled")])).toEqual({ dots: ["scheduled", "cancelled"], more: 0 });
  });
  it("four classes give the first three by start time and +1, each dot its class's state", () => {
    const four = [cls("19:00", "moved"), cls("17:00", "cancelled"), cls("18:00", "makeup"), cls("15:00", "scheduled")];
    expect(dayDots(four)).toEqual({ dots: ["scheduled", "cancelled", "makeup"], more: 1 });
  });
  it("the cell's name holds the full date and every state word", () => {
    expect(cellLabel({ date: "2026-10-13", classes: [cls("17:00", "cancelled"), cls("15:00", "scheduled")] })).toBe("Tuesday October 13: Scheduled, Cancelled");
    expect(cellLabel({ date: "2026-10-13", classes: [] })).toBe("Tuesday October 13: no classes");
  });
});

describe("copy (REQ-31 AC3)", () => {
  it("has no em-dash and never says done", () => {
    const states = Object.keys(STATE_LABEL) as ClassState[];
    const out = [
      summaryLine({ total: 2, past: 1, upcoming: 1 }), summaryLine({ total: 1, past: 1, upcoming: 0 }), summaryLine({ total: 0, past: 0, upcoming: 0 }),
      movedNote(cls("16:00", "moved", { date: "2026-10-19", original: { date: "2026-10-13", startTime: "17:30" } })),
      makeupNote(cls("15:00", "makeup", { makeupFor: "2026-10-13" })),
      ...states.map((st) => cellLabel({ date: "2026-10-13", classes: [cls("15:00", st)] })),
      ...Object.values(STATE_LABEL), ...Object.values(PURPOSE_LABEL), oneOffLabel(null),
    ];
    for (const s of out) {
      expect(s).not.toMatch(/—/);
      expect(s).not.toMatch(/\bdone\b/i);
    }
  });
});
