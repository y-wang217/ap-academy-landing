import { describe, expect, it } from "vitest";
import { buildMonth, classState, monthRange, parseMonth, shiftMonth, sundayWeekOf } from "./month";
import type { ClassException, ClassSeries, Occurrence } from "./recurrence";

const STAFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const KID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const series = (over: Partial<ClassSeries> & { id: string }): ClassSeries => ({
  staffId: STAFF, studentId: KID, subject: "MHF4U", kind: "weekly", startDate: "2026-09-01", startTime: "17:30",
  durationMinutes: 60, effectiveUntil: null, ...over,
});
// Tuesdays from Sep 1; in October 2026 those are the 6th, 13th, 20th and 27th.
const tue = series({ id: "s-tue" });
const build = (s: ClassSeries[], e: ClassException[] = [], month = "2026-10", today = "2026-10-16", now = "2026-10-16T16:00:00.000Z") =>
  buildMonth({ series: s, exceptions: e, month, today, now });
const monthClasses = (v: ReturnType<typeof build>) => v.weeks.flat().flatMap((d) => d.classes);

describe("buildMonth dates (AC1)", () => {
  it("a weekly series yields exactly its pattern dates in the month", () => {
    expect(monthClasses(build([tue])).map((c) => c.date)).toEqual(["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"]);
  });
  it("a one-off appears only on its date", () => {
    const one = series({ id: "s-one", kind: "one_off", startDate: "2026-10-22" });
    expect(monthClasses(build([one])).map((c) => c.date)).toEqual(["2026-10-22"]);
  });
  it("a series that ended before the month or starts after it yields nothing", () => {
    const ended = series({ id: "s-ended", startDate: "2026-08-04", effectiveUntil: "2026-09-29" });
    const future = series({ id: "s-future", startDate: "2026-11-03" });
    expect(monthClasses(build([ended, future]))).toEqual([]);
  });
});

describe("states (AC2)", () => {
  it("cancelled, moved with original slot, one-off and scheduled", () => {
    const one = series({ id: "s-one", kind: "one_off", startDate: "2026-10-22", startTime: "18:00" });
    const exc: ClassException[] = [
      { seriesId: "s-tue", originalDate: "2026-10-06", kind: "cancelled", newDate: null, newStartTime: null },
      { seriesId: "s-tue", originalDate: "2026-10-13", kind: "moved", newDate: "2026-10-15", newStartTime: "16:00" },
    ];
    const byDate = Object.fromEntries(monthClasses(build([tue, one], exc)).map((c) => [c.date, c]));
    expect(byDate["2026-10-06"].state).toBe("cancelled");
    expect(byDate["2026-10-15"].state).toBe("moved");
    expect(byDate["2026-10-15"].original).toEqual({ date: "2026-10-13", startTime: "17:30" });
    expect(byDate["2026-10-15"].startTime).toBe("16:00");
    expect(byDate["2026-10-22"].state).toBe("class");
    expect(byDate["2026-10-22"].original).toBeNull();
    expect(byDate["2026-10-20"].state).toBe("scheduled");
  });
  it("a moved one-off is Moved", () => {
    const one = series({ id: "s-one", kind: "one_off", startDate: "2026-10-22" });
    const exc: ClassException[] = [{ seriesId: "s-one", originalDate: "2026-10-22", kind: "moved", newDate: "2026-10-23", newStartTime: "15:00" }];
    const [c] = monthClasses(build([one], exc));
    expect(c.state).toBe("moved");
    expect(c.date).toBe("2026-10-23");
  });
  it("classState maps each occurrence shape", () => {
    const o = (status: Occurrence["status"], kind: Occurrence["kind"], purpose: Occurrence["purpose"] = null) => ({ status, kind, purpose }) as Occurrence;
    expect(classState(o("cancelled", "one_off"))).toBe("cancelled");
    expect(classState(o("moved", "weekly"))).toBe("moved");
    expect(classState(o("scheduled", "weekly"))).toBe("scheduled");
  });
});

describe("one-off purpose (REQ-31 AC4, AC5)", () => {
  const o = (status: Occurrence["status"], kind: Occurrence["kind"], purpose: Occurrence["purpose"]) => ({ status, kind, purpose }) as Occurrence;
  it("a scheduled one-off is labelled by its purpose, and Class when none is set", () => {
    expect(classState(o("scheduled", "one_off", null))).toBe("class");
    expect(classState(o("scheduled", "one_off", "makeup"))).toBe("makeup");
    expect(classState(o("scheduled", "one_off", "trial"))).toBe("trial");
    expect(classState(o("scheduled", "one_off", "extra"))).toBe("extra");
  });
  it("cancelled and moved win over any purpose", () => {
    for (const p of [null, "makeup", "trial", "extra"] as const) {
      expect(classState(o("cancelled", "one_off", p))).toBe("cancelled");
      expect(classState(o("moved", "one_off", p))).toBe("moved");
    }
  });
  it("buildMonth carries the series purpose to the class", () => {
    const trial = series({ id: "s-trial", kind: "one_off", startDate: "2026-10-22", purpose: "trial" });
    const legacy = series({ id: "s-legacy", kind: "one_off", startDate: "2026-10-23" });
    const byDate = Object.fromEntries(monthClasses(build([trial, legacy])).map((c) => [c.date, c]));
    expect(byDate["2026-10-22"].state).toBe("trial");
    expect(byDate["2026-10-23"].state).toBe("class");
  });
});

describe("makeup link (REQ-31 AC7)", () => {
  const cancelled: ClassException = { id: "x-1", seriesId: "s-tue", originalDate: "2026-10-13", kind: "cancelled", newDate: null, newStartTime: null };
  const makeup = series({ id: "s-mk", kind: "one_off", startDate: "2026-10-22", purpose: "makeup", makeupFor: "x-1" });
  const find = (v: ReturnType<typeof build>) => monthClasses(v).find((c) => c.key.startsWith("s-mk"))!;
  it("names the original date of the cancellation it replaces", () => {
    const c = find(build([tue, makeup], [cancelled]));
    expect(c.state).toBe("makeup");
    expect(c.makeupFor).toBe("2026-10-13");
  });
  it("is null when the exception is not in the input", () => {
    expect(find(build([tue, makeup], [])).makeupFor).toBeNull();
  });
  it("is null when the exception is now a move", () => {
    const moved: ClassException = { ...cancelled, kind: "moved", newDate: "2026-10-14", newStartTime: "17:30" };
    expect(find(build([tue, makeup], [moved])).makeupFor).toBeNull();
  });
  it("is null on every class that is not a makeup", () => {
    expect(monthClasses(build([tue], [cancelled])).every((c) => c.makeupFor === null)).toBe(true);
  });
});

describe("moved across months (AC3)", () => {
  it("moved in from September shows on its new date; moved out to November does not show", () => {
    const exc: ClassException[] = [
      { seriesId: "s-tue", originalDate: "2026-09-29", kind: "moved", newDate: "2026-10-02", newStartTime: "17:30" },
      { seriesId: "s-tue", originalDate: "2026-10-27", kind: "moved", newDate: "2026-11-02", newStartTime: "17:30" },
    ];
    const dates = monthClasses(build([tue], exc)).map((c) => c.date);
    expect(dates).toContain("2026-10-02");
    expect(dates).not.toContain("2026-10-27");
    expect(dates).not.toContain("2026-11-02");
  });
});

describe("summary (AC4, REQ-31 AC1)", () => {
  it("counts non-cancelled classes, past at the end time", () => {
    const exc: ClassException[] = [{ seriesId: "s-tue", originalDate: "2026-10-20", kind: "cancelled", newDate: null, newStartTime: null }];
    // Oct 13 17:30-18:30 Toronto (EDT) ends 22:30Z.
    expect(build([tue], exc, "2026-10", "2026-10-13", "2026-10-13T22:30:00.000Z").summary).toEqual({ total: 3, past: 2, upcoming: 1 });
    expect(build([tue], exc, "2026-10", "2026-10-13", "2026-10-13T22:29:00.000Z").summary).toEqual({ total: 3, past: 1, upcoming: 2 });
  });
});

describe("no done field (REQ-31 AC1)", () => {
  it("summary and classes carry past, never done", () => {
    const v = build([tue], [], "2026-10", "2026-10-13", "2026-10-13T22:30:00.000Z");
    expect(Object.keys(v.summary).sort()).toEqual(["past", "total", "upcoming"]);
    const c13 = monthClasses(v).find((c) => c.date === "2026-10-13")!;
    expect(c13.past).toBe(true);
    expect(monthClasses(v).find((c) => c.date === "2026-10-20")!.past).toBe(false);
    for (const c of monthClasses(v)) expect(c).not.toHaveProperty("done");
  });
});

describe("grid (AC7)", () => {
  it("Sunday-first weeks cover the month; outside days are muted and empty", () => {
    const v = build([tue]);
    expect(v.weeks[0][0].date).toBe("2026-09-27");
    expect(v.weeks.at(-1)!.at(-1)!.date).toBe("2026-10-31");
    expect(v.weeks.every((w) => w.length === 7)).toBe(true);
    const sep29 = v.weeks[0].find((d) => d.date === "2026-09-29")!;
    expect(sep29.inMonth).toBe(false);
    expect(sep29.classes).toEqual([]);
    expect(v.weeks.flat().find((d) => d.date === "2026-10-16")!.isToday).toBe(true);
  });
  it("classes in a day are ordered by start time", () => {
    const early = series({ id: "s-early", startTime: "09:00" });
    const day = build([tue, early]).weeks.flat().find((d) => d.date === "2026-10-06")!;
    expect(day.classes.map((c) => c.startTime)).toEqual(["09:00", "17:30"]);
  });
});

describe("This week (AC9)", () => {
  it("is the Sunday week of today, across a month boundary, whatever month is shown", () => {
    const wed = series({ id: "s-wed", startDate: "2026-09-02" });
    const v = build([tue, wed], [], "2026-12", "2026-10-01", "2026-10-01T12:00:00.000Z");
    expect(v.thisWeek.map((c) => c.date)).toEqual(["2026-09-29", "2026-09-30"]);
    const v2 = build([tue], [], "2026-10", "2026-11-01", "2026-11-01T12:00:00.000Z");
    expect(v2.thisWeek.map((c) => c.date)).toEqual(["2026-11-03"]);
  });
});

describe("month parameters (AC6)", () => {
  it("parseMonth falls back to today's month", () => {
    expect(parseMonth(undefined, "2026-10-16")).toBe("2026-10");
    expect(parseMonth("nope", "2026-10-16")).toBe("2026-10");
    expect(parseMonth("2026-13", "2026-10-16")).toBe("2026-10");
    expect(parseMonth("1999-01", "2026-10-16")).toBe("2026-10");
    expect(parseMonth("2027-02", "2026-10-16")).toBe("2027-02");
  });
  it("shiftMonth crosses year ends both ways", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(build([tue], [], "2026-12").next).toBe("2027-01");
    expect(build([tue], [], "2026-12").prev).toBe("2026-11");
  });
  it("monthRange and sundayWeekOf", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(sundayWeekOf("2026-10-16")).toEqual({ from: "2026-10-11", to: "2026-10-17" });
    expect(sundayWeekOf("2026-10-11")).toEqual({ from: "2026-10-11", to: "2026-10-17" });
  });
});
