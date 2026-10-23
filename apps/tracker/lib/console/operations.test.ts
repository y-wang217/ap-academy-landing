import { describe, expect, it } from "vitest";
import type { LessonRow } from "../domain/schedule/lesson-link";
import type { OutcomeFact, StaffAvailability } from "../domain/schedule/operations";
import type { ClassSeries } from "../domain/schedule/recurrence";
import type { PeopleSnapshot } from "./facade";
import { loadOperationsPanels, LESSONS_NOT_READY, type OperationsInput } from "./operations";
import type { LessonsRead, OperationsReader, ScheduleRead } from "./operations-read";

// REQ-58 AC1, AC2, AC5, AC6, AC9: the panel builder over a fake reader. Now Thu 2026-10-22 16:00 Toronto.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const NOW = new Date("2026-10-22T20:00:00.000Z");
const RYAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
const SETTER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003";
const SAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const LESSONS_DS = "6300f58a-8b8c-4789-88c1-e44272079b0f";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Weekly Thu 10:00 for Ryan from 1 Oct: gaps on 15 and 22 Oct in a 14-day window; Ana Mon 16:00.
const series = (n: number, staffId: string, startDate: string, startTime: string, extra: Partial<ClassSeries> = {}): ClassSeries => ({
  id: ID(n), staffId, studentId: SAM, subject: "MHF4U", kind: "weekly", startDate, startTime, durationMinutes: 60, effectiveUntil: null, ...extra,
});
const SCHEDULE: ScheduleRead = { series: [series(1, RYAN, "2026-10-01", "10:00"), series(2, ANA, "2026-10-05", "16:00")], exceptions: [] };
const AVAILABILITY: StaffAvailability[] = [{ staffId: RYAN, windows: [{ weekday: 4, startTime: "09:00", endTime: "13:00", effectiveFrom: "2026-01-05", effectiveUntil: null }], exceptions: [] }];
const PEOPLE: PeopleSnapshot = {
  students: [{ id: SAM, name: "Sam S.", stage: "Active", active: true }],
  staff: [{ id: RYAN, name: "Ryan M.", active: true }, { id: ANA, name: "Ana P.", active: true }, { id: SETTER, name: "Sid S.", active: false }],
  syncedAt: "2026-10-22T19:30:00.000Z",
};

type Fake = { schedule?: () => Promise<ScheduleRead>; availability?: () => Promise<StaffAvailability[]>; outcomes?: () => Promise<OutcomeFact[]>; lessons?: () => Promise<LessonsRead> };
function reader(f: Fake = {}): OperationsReader {
  return {
    schedule: f.schedule ?? (async () => SCHEDULE),
    availability: f.availability ?? (async () => AVAILABILITY),
    outcomes: f.outcomes ?? (async () => []),
    unlinkedLessons: f.lessons ?? (async () => ({ ok: true, rows: [] })),
  };
}
const boom = async (): Promise<never> => { throw new Error("unavailable"); };
const load = (f: Fake = {}, extra: Partial<OperationsInput> = {}) => loadOperationsPanels({
  reader: reader(f), people: async () => PEOPLE, now: NOW, gapDays: 14, orgId: ORG, lessonsSourceId: LESSONS_DS, query: { mode: "operations" },
  freshness: new Map(), timeoutMs: 8_000, ...extra,
});

describe("loadOperationsPanels, all reads ok", () => {
  it("teacher load lists active teachers by name with both weeks", async () => {
    const { teacherLoad } = await load();
    expect(teacherLoad.status).toBe("ready");
    expect(teacherLoad.data!.rows.map((r) => r.name)).toEqual(["Ana P.", "Ryan M."]);
    const ryan = teacherLoad.data!.rows[1];
    expect(ryan.weeks[0]).toMatchObject({ scheduledMinutes: 60, deliveredMinutes: 0, availability: "entered", availableMinutes: 240, insideMinutes: 60 });
    expect(ryan.weeks[1].deliveredMinutes).toBeNull();
    expect(teacherLoad.data!.rows[0].weeks[0].availability).toBe("not_entered");
    expect(teacherLoad.data!.weeks.map((w) => w.label)).toEqual(["Mon 19 Oct to Sun 25 Oct", "Mon 26 Oct to Sun 1 Nov"]);
    expect(teacherLoad.canonical).toEqual({ href: "/tracker/schedule", label: "Open schedule" });
  });

  it("a snapshot of one Active Teacher and one active Setter with no classes renders one teacher row", async () => {
    const { teacherLoad } = await load({ schedule: async () => ({ series: [], exceptions: [] }), availability: async () => [] }, {
      people: async () => ({ ...PEOPLE, staff: [{ id: RYAN, name: "Ryan M.", active: true }, { id: SETTER, name: "Sid S.", active: false }] }),
    });
    expect(teacherLoad.data!.rows.map((r) => r.name)).toEqual(["Ryan M."]);
  });

  it("a non-teaching staff member with a class is listed and flagged", async () => {
    const { teacherLoad } = await load({ schedule: async () => ({ series: [series(3, SETTER, "2026-10-21", "10:00", { kind: "one_off" })], exceptions: [] }) });
    const sid = teacherLoad.data!.rows.find((r) => r.staffId === SETTER)!;
    expect(sid).toMatchObject({ name: "Sid S.", notTeaching: true });
  });

  it("lesson gaps list the ended classes with their keys, actions and week-view links; no-shows apart", async () => {
    const outcomes = async (): Promise<OutcomeFact[]> => [{ seriesId: ID(1), originalDate: "2026-10-15", outcome: "no_show", notionLessonId: null }];
    const { lessonGaps } = await load({ outcomes });
    expect(lessonGaps.status).toBe("ready");
    expect(lessonGaps.count).toBe(3); // Ryan 22 Oct, Ana 12 and 19 Oct
    expect(lessonGaps.data!.gaps.filter((g) => g.key.includes(ID(1)))).toEqual([{
      id: `sched:${ID(1)}:2026-10-22`, key: `sched:${ID(1)}:2026-10-22`, title: "Sam S. with Ryan M., MHF4U", action: "log", reason: "Log",
      ended: "ended Thu 22 Oct 11:00", endedAt: "2026-10-22T15:00:00.000Z", href: `/tracker/schedule?date=2026-10-22&staffId=${RYAN}`,
    }]);
    expect(lessonGaps.data!.noShows.map((n) => n.key)).toEqual([`sched:${ID(1)}:2026-10-15`]);
    expect(lessonGaps.data!.window).toMatchObject({ from: "2026-10-09", to: "2026-10-22", days: 14 });
    expect(lessonGaps.data!.toggle).toEqual({ href: "?mode=operations&gapDays=31", label: "Show 31 days" });
    expect(lessonGaps.canonical).toEqual({ href: "/tracker/schedule/lessons?from=2026-10-09&to=2026-10-22", label: "Open unlinked lessons" });
  });

  it("a candidate lesson makes the action Link existing lesson, linking to the Unlinked lessons page", async () => {
    const lesson: LessonRow = { id: ID(700), date: "2026-10-22", staffIds: [RYAN], studentIds: [SAM], ref: "" };
    const { lessonGaps } = await load({ lessons: async () => ({ ok: true, rows: [lesson] }) });
    const gap = lessonGaps.data!.gaps.find((g) => g.key.endsWith("2026-10-22"))!;
    expect(gap).toMatchObject({ action: "link", reason: "Link existing lesson (1 candidate)", href: "/tracker/schedule/lessons?from=2026-10-09&to=2026-10-22" });
  });

  it("the window toggle keeps the other query parameters", async () => {
    const { lessonGaps } = await load({}, { gapDays: 31, query: { mode: "operations", week: "2026-10-12", gapDays: "31" } });
    expect(lessonGaps.data!.toggle).toEqual({ href: "?mode=operations&week=2026-10-12&gapDays=14", label: "Show 14 days" });
    expect(lessonGaps.data!.gaps.filter((g) => g.key.includes(ID(1))).map((g) => g.key.slice(-10))).toEqual(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"]);
  });

  it("upcoming lists the next 7 days with badges and week-view links", async () => {
    const { upcoming } = await load();
    // Ryan's Thu 29 Oct is day 7, outside; Ana's Mon 26 Oct is in.
    expect(upcoming.data!.map((i) => [i.title, i.due, i.reason, i.href])).toEqual([["Sam S. with Ana P., MHF4U", "Mon 26 Oct 16:00", "Regular", `/tracker/schedule?date=2026-10-26&staffId=${ANA}`]]);
  });

  it("the capacity gauge sums inside over available across teachers with availability, and says who is left out", async () => {
    const { capacity } = await load();
    expect(capacity.data).toEqual({ value: 1, max: 4, unit: "h" });
    expect(capacity.status).toBe("stale");
    expect(capacity.staleReason).toBe("1 teacher without availability not counted");
  });

  it("evidence names the tables read, freshness keeps times under operations keys only", async () => {
    const freshness = new Map<string, string>();
    const { teacherLoad, lessonGaps } = await load({}, { freshness });
    expect(teacherLoad.sourceEvidence.map((e) => e.sourceId)).toContain("tracker.availability_windows");
    expect(lessonGaps.sourceEvidence.map((e) => e.sourceId)).toContain(LESSONS_DS);
    expect([...freshness.keys()].sort()).toEqual([`${ORG}:operations.lessons`, `${ORG}:operations.schedule`]);
    expect([...freshness.values()].every((v) => v === NOW.toISOString())).toBe(true);
  });

  it("lists past the cap end with an N more row", async () => {
    const many = Array.from({ length: 30 }, (_, i) => series(100 + i, RYAN, "2026-10-23", "09:00", { kind: "one_off" }));
    const { upcoming } = await load({ schedule: async () => ({ series: many, exceptions: [] }) });
    expect(upcoming.data).toHaveLength(26);
    expect(upcoming.data![25]).toMatchObject({ id: "more", title: "5 more", href: "/tracker/schedule" });
    expect(upcoming.count).toBe(30);
  });
});

describe("loadOperationsPanels, failures (AC5, AC6, AC9)", () => {
  it("a failed schedule read makes the four panels error", async () => {
    const p = await load({ schedule: boom });
    expect([p.teacherLoad.status, p.lessonGaps.status, p.upcoming.status, p.capacity.status]).toEqual(["error", "error", "error", "error"]);
    expect(p.teacherLoad.errorMessage).toBe("Read failed");
    expect(p.teacherLoad.canonical?.href).toBe("/tracker/schedule");
  });

  it("a failed outcomes read leaves teacher load stale with scheduled figures, and only gaps error", async () => {
    const p = await load({ outcomes: boom });
    expect(p.teacherLoad.status).toBe("stale");
    expect(p.teacherLoad.staleReason).toBe("Delivered minutes unavailable");
    expect(p.teacherLoad.data!.rows[1].weeks[0]).toMatchObject({ scheduledMinutes: 60, deliveredMinutes: null });
    expect(p.lessonGaps.status).toBe("error");
    expect(p.lessonGaps.data).toBeNull();
    expect(p.upcoming.status).toBe("ready");
  });

  it("a failed availability read shows unavailable, never not entered or 0, and capacity errors", async () => {
    const p = await load({ availability: boom });
    expect(p.teacherLoad.status).toBe("stale");
    expect(p.teacherLoad.staleReason).toBe("Availability unavailable");
    expect(p.teacherLoad.data!.rows.every((r) => r.weeks[0].availability === "unknown" && r.weeks[0].utilisation === null)).toBe(true);
    expect(p.capacity.status).toBe("error");
  });

  it("lessons_not_ready is an error with the exact message and no rows; load and upcoming unaffected", async () => {
    const p = await load({ lessons: async () => ({ ok: false, code: "lessons_not_ready" }) });
    expect(p.lessonGaps).toMatchObject({ status: "error", errorMessage: LESSONS_NOT_READY, data: null });
    expect(LESSONS_NOT_READY).toBe("Lessons is missing Class occurrence");
    expect(p.teacherLoad.status).toBe("ready");
    expect(p.upcoming.status).toBe("ready");
  });

  it("Notion not configured is an error naming it", async () => {
    const p = await load({ lessons: async () => ({ ok: false, code: "not_configured" }) });
    expect(p.lessonGaps).toMatchObject({ status: "error", errorMessage: "Notion is not configured" });
  });

  it("any other Lessons failure keeps the gaps, stale, with Review actions", async () => {
    const p = await load({ lessons: async () => ({ ok: false, code: "failed" }) });
    expect(p.lessonGaps.status).toBe("stale");
    expect(p.lessonGaps.staleReason).toBe("Lesson candidates unavailable");
    expect(p.lessonGaps.data!.gaps.every((g) => g.action === "review" && g.reason === "Review" && g.href.startsWith("/tracker/schedule/lessons?"))).toBe(true);
  });

  it("a failed people read with classes names Unknown teacher, stale names_unavailable", async () => {
    const p = await load({}, { people: boom });
    expect(p.teacherLoad.status).toBe("stale");
    expect(p.teacherLoad.staleReason).toBe("names_unavailable");
    expect(p.teacherLoad.data!.rows.map((r) => r.name)).toEqual(["Unknown teacher", "Unknown teacher"]);
    expect(p.teacherLoad.data!.rows.some((r) => r.notTeaching)).toBe(false);
  });

  it("a failed people read with no classes or availability is unverifiable, never No teachers active", async () => {
    const p = await load({ schedule: async () => ({ series: [], exceptions: [] }), availability: async () => [] }, { people: boom });
    expect(p.teacherLoad).toMatchObject({ status: "unverifiable", staleReason: "Teacher roster unavailable", data: null });
  });

  it("an empty org is empty, not unverifiable", async () => {
    const p = await load({ schedule: async () => ({ series: [], exceptions: [] }), availability: async () => [] }, { people: async () => ({ ...PEOPLE, staff: [] }) });
    expect(p.teacherLoad.status).toBe("empty");
    expect(p.upcoming.status).toBe("empty");
    expect(p.lessonGaps.status).toBe("empty");
    expect(p.capacity.status).toBe("empty");
  });

  it("no teacher with availability makes capacity unverifiable", async () => {
    const p = await load({ availability: async () => [] });
    expect(p.capacity).toMatchObject({ status: "unverifiable", staleReason: "Availability not entered" });
  });

  it("a read that times out says so", async () => {
    const never = () => new Promise<never>(() => {});
    const p = await load({ schedule: never }, { timeoutMs: 20 });
    expect(p.teacherLoad.errorMessage).toBe("Timed out after 0.02 s");
  });
});
