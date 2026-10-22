import { describe, expect, it } from "vitest";
import type { AvailabilityWindow } from "./availability";
import type { LessonRow } from "./lesson-link";
import { lessonGaps, teacherLoad, teacherRoster, upcomingClasses, type OutcomeFact, type StaffAvailability } from "./operations";
import { expandOccurrences, type ClassException, type ClassSeries } from "./recurrence";

// REQ-58: the pure operations aggregation. Today Thu 2026-10-22, now 16:00 Toronto (EDT).
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const T2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
const S = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TODAY = "2026-10-22";
const NOW = new Date("2026-10-22T20:00:00.000Z");
const CURRENT = { from: "2026-10-19", to: "2026-10-25" };
const NEXT = { from: "2026-10-26", to: "2026-11-01" };
const RANGE = { from: "2026-10-01", to: "2026-11-01" };

const series = (n: number, kind: ClassSeries["kind"], startDate: string, startTime: string, extra: Partial<ClassSeries> = {}): ClassSeries => ({
  id: ID(n), staffId: T, studentId: S, subject: "MHF4U", kind, startDate, startTime, durationMinutes: 60, effectiveUntil: null, ...extra,
});
const win = (weekday: number, startTime: string, endTime: string, effectiveFrom = "2026-01-05"): AvailabilityWindow => ({ weekday, startTime, endTime, effectiveFrom, effectiveUntil: null });
const avail = (staffId: string, windows: AvailabilityWindow[]): StaffAvailability => ({ staffId, windows, exceptions: [] });
const delivered = (n: number, originalDate: string, notionLessonId: string | null = ID(900)): OutcomeFact => ({ seriesId: ID(n), originalDate, outcome: "delivered", notionLessonId });
const load = (occurrences: ReturnType<typeof expandOccurrences>, extra: Partial<Parameters<typeof teacherLoad>[0]> = {}) =>
  teacherLoad({ staffIds: [T], occurrences, current: CURRENT, next: NEXT, availability: [avail(T, [win(1, "15:00", "19:00"), win(3, "15:00", "19:00")])], outcomes: [], now: NOW, ...extra })[0];

describe("teacherLoad (AC1, AC2, AC4)", () => {
  // Weekly Mon 16:00 and Wed 16:00, plus a Thu 17:00 class today (not yet ended).
  const base = [series(1, "weekly", "2026-10-05", "16:00"), series(2, "weekly", "2026-10-07", "16:00"), series(3, "weekly", "2026-10-08", "17:00")];

  it("cancelled occurrences are excluded from scheduled minutes", () => {
    const cancel: ClassException[] = [{ seriesId: ID(1), originalDate: "2026-10-19", kind: "cancelled", newDate: null, newStartTime: null }];
    expect(load(expandOccurrences(base, [], RANGE)).weeks[0].scheduledMinutes).toBe(180);
    expect(load(expandOccurrences(base, cancel, RANGE)).weeks[0].scheduledMinutes).toBe(120);
  });

  it("delivered counts only ended classes with a delivered outcome and a lesson id; others stay scheduled", () => {
    const occs = expandOccurrences(base, [], RANGE);
    const outcomes: OutcomeFact[] = [
      delivered(1, "2026-10-19"),
      delivered(2, "2026-10-21", null), // log in progress
      delivered(3, "2026-10-22"), // not ended yet
    ];
    const row = load(occs, { outcomes });
    expect(row.weeks[0].scheduledMinutes).toBe(180);
    expect(row.weeks[0].deliveredMinutes).toBe(60);
    const noShow = load(occs, { outcomes: [{ seriesId: ID(1), originalDate: "2026-10-19", outcome: "no_show", notionLessonId: null }] });
    expect(noShow.weeks[0].deliveredMinutes).toBe(0);
    expect(noShow.weeks[0].scheduledMinutes).toBe(180);
  });

  it("next week has no delivered figure, and unknown outcomes give null, never 0", () => {
    const occs = expandOccurrences(base, [], RANGE);
    expect(load(occs).weeks[1].deliveredMinutes).toBeNull();
    expect(load(occs, { outcomes: null }).weeks[0].deliveredMinutes).toBeNull();
  });

  it("a move into the week counts on the new date; a move out does not", () => {
    const occs = (e: ClassException[]) => expandOccurrences([series(1, "one_off", "2026-10-28", "16:00")], e, RANGE);
    const moveIn: ClassException[] = [{ seriesId: ID(1), originalDate: "2026-10-28", kind: "moved", newDate: "2026-10-21", newStartTime: "16:00" }];
    expect(load(occs([])).weeks.map((w) => w.scheduledMinutes)).toEqual([0, 60]);
    expect(load(occs(moveIn)).weeks.map((w) => w.scheduledMinutes)).toEqual([60, 0]);
  });

  it("a split series counts each date once, and effective_until ends output", () => {
    const split = [
      series(1, "weekly", "2026-10-05", "16:00", { effectiveUntil: "2026-10-25" }),
      series(2, "weekly", "2026-10-26", "17:00"),
    ];
    const row = load(expandOccurrences(split, [], RANGE));
    expect(row.weeks.map((w) => w.scheduledMinutes)).toEqual([60, 60]);
    const ended = load(expandOccurrences([series(1, "weekly", "2026-10-05", "16:00", { effectiveUntil: "2026-10-18" })], [], RANGE));
    expect(ended.weeks.map((w) => w.scheduledMinutes)).toEqual([0, 0]);
  });

  it("availability entered gives inside, outside and utilisation from weekTotals", () => {
    // Mon 16:00 and Wed 16:00 inside 15:00 to 19:00; Thu 17:00 outside. 8 h available.
    const w = load(expandOccurrences(base, [], RANGE)).weeks[0];
    expect(w).toMatchObject({ availability: "entered", availableMinutes: 480, insideMinutes: 120, outsideMinutes: 60 });
    expect(w.utilisation).toBeCloseTo(0.25);
  });

  it("no availability rows at all is not_entered with every figure null", () => {
    const w = load(expandOccurrences(base, [], RANGE), { availability: [] }).weeks[0];
    expect(w).toMatchObject({ availability: "not_entered", availableMinutes: null, insideMinutes: null, utilisation: null, scheduledMinutes: 180 });
  });

  it("availability summing to 0 is entered with 0 available and no utilisation", () => {
    const future = [avail(T, [win(1, "15:00", "19:00", "2026-12-01")])];
    const w = load(expandOccurrences(base, [], RANGE), { availability: future }).weeks[0];
    expect(w).toMatchObject({ availability: "entered", availableMinutes: 0, utilisation: null });
  });

  it("a failed availability read is unknown, never not_entered", () => {
    const w = load(expandOccurrences(base, [], RANGE), { availability: null }).weeks[0];
    expect(w).toMatchObject({ availability: "unknown", availableMinutes: null, scheduledMinutes: 180 });
  });

  it("a week across the DST change keeps wall-clock dates", () => {
    // Sun 2026-11-01 is the fall-back day; a Sunday class lands in next week once.
    const row = load(expandOccurrences([series(1, "weekly", "2026-10-25", "10:00")], [], RANGE));
    expect(row.weeks.map((w) => w.scheduledMinutes)).toEqual([60, 60]);
  });

  it("other teachers' classes are not counted", () => {
    const occs = expandOccurrences([series(1, "weekly", "2026-10-05", "16:00", { staffId: T2 })], [], RANGE);
    expect(load(occs).weeks[0].scheduledMinutes).toBe(0);
  });
});

describe("lessonGaps (AC3)", () => {
  // Weekly Thu 10:00, from 2026-10-01: Oct 1, 8, 15, 22 (today, ended at 11:00).
  const occs = expandOccurrences(
    [series(1, "weekly", "2026-10-01", "10:00"), series(2, "one_off", "2026-10-22", "17:00"), series(3, "one_off", "2026-10-20", "09:00")],
    [{ seriesId: ID(3), originalDate: "2026-10-20", kind: "cancelled", newDate: null, newStartTime: null }],
    RANGE,
  );
  const window = { from: "2026-10-09", to: TODAY };
  const gaps = (outcomes: OutcomeFact[], lessons: LessonRow[] | null = []) => lessonGaps({ occurrences: occs, window, today: TODAY, now: NOW, outcomes, lessons });

  it("lists ended classes in the window with no outcome, keyed by the occurrence ref, oldest first", () => {
    const r = gaps([]);
    expect(r.gaps.map((g) => g.key)).toEqual([`sched:${ID(1)}:2026-10-15`, `sched:${ID(1)}:2026-10-22`]);
    expect(r.gaps.every((g) => g.nextAction === "log" && g.candidates === 0)).toBe(true);
  });

  it("a class today that has not ended, and a cancelled past class, are not gaps", () => {
    const keys = gaps([]).gaps.map((g) => g.key);
    expect(keys).not.toContain(`sched:${ID(2)}:2026-10-22`);
    expect(keys).not.toContain(`sched:${ID(3)}:2026-10-20`);
  });

  it("a no-show is listed separately and never as a gap; a pending log is counted, not a gap", () => {
    const r = gaps([{ seriesId: ID(1), originalDate: "2026-10-15", outcome: "no_show", notionLessonId: null }, delivered(1, "2026-10-22", null)]);
    expect(r.gaps).toEqual([]);
    expect(r.noShows.map((o) => o.originalDate)).toEqual(["2026-10-15"]);
    expect(r.pendingLogs).toBe(1);
  });

  it("a matching unlinked lesson makes the next action link with its count; no lessons read makes it review", () => {
    const lesson: LessonRow = { id: ID(700), date: "2026-10-15", staffIds: [T], studentIds: [S], ref: "" };
    const link = gaps([], [lesson]).gaps[0];
    expect(link).toMatchObject({ nextAction: "link", candidates: 1 });
    expect(gaps([], null).gaps.every((g) => g.nextAction === "review" && g.candidates === null)).toBe(true);
  });

  it("a moved occurrence is keyed by its original date", () => {
    const moved = expandOccurrences([series(1, "one_off", "2026-10-13", "10:00")], [{ seriesId: ID(1), originalDate: "2026-10-13", kind: "moved", newDate: "2026-10-14", newStartTime: "10:00" }], RANGE);
    const r = lessonGaps({ occurrences: moved, window, today: TODAY, now: NOW, outcomes: [], lessons: [] });
    expect(r.gaps.map((g) => [g.key, g.occurrence.date])).toEqual([[`sched:${ID(1)}:2026-10-13`, "2026-10-14"]]);
  });
});

describe("upcomingClasses (AC7)", () => {
  const occs = expandOccurrences(
    [
      series(1, "weekly", "2026-10-01", "10:00"), // today's ended; next Thu 29 Oct (day +7, out)
      series(2, "one_off", "2026-10-22", "17:00", { purpose: "trial" }),
      series(3, "one_off", "2026-10-24", "09:00", { purpose: "makeup" }),
      series(4, "one_off", "2026-10-25", "09:00", { purpose: "extra" }),
      series(5, "one_off", "2026-10-26", "09:00"),
      series(6, "weekly", "2026-10-06", "12:00"), // Tue 27 Oct, cancelled
    ],
    [{ seriesId: ID(6), originalDate: "2026-10-27", kind: "cancelled", newDate: null, newStartTime: null }],
    RANGE,
  );
  const rows = upcomingClasses({ occurrences: occs, today: TODAY, now: NOW });

  it("keeps today to today + 6, drops ended classes, keeps cancelled ones, in start order", () => {
    expect(rows.map((r) => [r.occurrence.seriesId, r.occurrence.date, r.occurrence.status])).toEqual([
      [ID(2), "2026-10-22", "scheduled"], [ID(3), "2026-10-24", "scheduled"], [ID(4), "2026-10-25", "scheduled"],
      [ID(5), "2026-10-26", "scheduled"], [ID(6), "2026-10-27", "cancelled"],
    ]);
  });

  it("badges every purpose, weekly as regular and a null purpose as one-off", () => {
    expect(rows.map((r) => r.badge)).toEqual(["trial", "makeup", "extra", "one_off", "regular"]);
  });
});

describe("teacherRoster (AC9)", () => {
  const SETTER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003";
  const ARCHIVED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0004";
  const STRANGER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005";
  const staff = [{ id: T, active: true }, { id: SETTER, active: false }, { id: ARCHIVED, active: false }];
  const roster = (occurrences = [] as ReturnType<typeof expandOccurrences>, availability: StaffAvailability[] | null = [], s: typeof staff | null = staff) =>
    teacherRoster({ staff: s, occurrences, availability, range: RANGE });

  it("an active teacher with no classes is listed as teaching; a non-teaching member with nothing in range is not", () => {
    expect(roster()).toEqual([{ staffId: T, teaching: true }]);
  });

  it("a non-teaching member with a class in range is listed, not teaching", () => {
    const occs = expandOccurrences([series(1, "one_off", "2026-10-21", "10:00", { staffId: SETTER })], [], RANGE);
    expect(roster(occs)).toEqual([{ staffId: T, teaching: true }, { staffId: SETTER, teaching: false }]);
  });

  it("an archived teacher with availability only is listed, not teaching", () => {
    expect(roster([], [avail(ARCHIVED, [win(2, "10:00", "12:00")])])).toContainEqual({ staffId: ARCHIVED, teaching: false });
  });

  it("an id on a class with no snapshot row is listed, not teaching, and ids differing by dashes or case are one", () => {
    const occs = expandOccurrences([
      series(1, "one_off", "2026-10-21", "10:00", { staffId: STRANGER }),
      series(2, "one_off", "2026-10-21", "12:00", { staffId: STRANGER.replaceAll("-", "").toUpperCase() }),
      series(3, "one_off", "2026-10-21", "14:00", { staffId: T.toUpperCase() }),
    ], [], RANGE);
    expect(roster(occs)).toEqual([{ staffId: T, teaching: true }, { staffId: STRANGER, teaching: false }]);
  });

  it("with no people read, only class and availability ids, none teaching", () => {
    const occs = expandOccurrences([series(1, "one_off", "2026-10-21", "10:00")], [], RANGE);
    expect(roster(occs, [avail(T2, [win(2, "10:00", "12:00")])], null)).toEqual([{ staffId: T, teaching: false }, { staffId: T2, teaching: false }]);
  });

  it("a cancelled class or a class outside the range adds nobody", () => {
    const occs = expandOccurrences([series(1, "one_off", "2026-10-21", "10:00", { staffId: SETTER })], [{ seriesId: ID(1), originalDate: "2026-10-21", kind: "cancelled", newDate: null, newStartTime: null }], RANGE);
    expect(roster(occs)).toEqual([{ staffId: T, teaching: true }]);
  });
});
