import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StaffRecord } from "../../../lib/notion/staff";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import { handleWeek, loadWeek, type ScheduleDeps } from "../../../lib/scheduler/schedule-handlers";
import type { AvailabilityExceptionRecord, ScheduleStore, SeriesRecord, WindowRecord } from "../../../lib/scheduler/schedule-store";
import type { ClassException } from "../../../lib/domain/schedule/recurrence";
import { WeekResponseAdmin, WeekResponseTeacher } from "../../../lib/scheduler/schemas";
import type { OutcomeRecord, OutcomeStore } from "../../../lib/scheduler/outcome-store";

const ORG = "10000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const S1 = "d1111111-1111-4111-8111-111111111111";
const S2 = "d2222222-2222-4222-8222-222222222222";
const S3 = "d3333333-3333-4333-8333-333333333333";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mk = (id: string, name: string, over: Partial<StaffRecord> = {}): StaffRecord => ({ id, name, email: `${name}@example.com`, functions: ["Teacher"], status: "Active", subjects: ["MHF4U"], ...over });
const ryan = mk(A, "ryan");
const kuby = mk(B, "kuby");
const idle = mk(C, "zed");
const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: ryan };
const STAMP = "2026-10-14T12:00:00.000Z";

const series = (n: number, staffId: string, studentId: string, startDate: string, startTime: string, kind: "weekly" | "one_off" = "weekly"): SeriesRecord => ({
  id: ID(n), staffId, studentId, subject: "MHF4U", kind, startDate, startTime, durationMinutes: 60, effectiveUntil: null, updatedAt: STAMP, splitFrom: null,
});
const window = (n: number, staffId: string, weekday: number, startTime: string, endTime: string): WindowRecord => ({
  id: ID(n), staffId, weekday, startTime, endTime, effectiveFrom: "2026-01-05", effectiveUntil: null, updatedAt: STAMP,
});

function fakeStore(rows: { series: SeriesRecord[]; windows: WindowRecord[]; availExceptions?: AvailabilityExceptionRecord[]; exceptions?: ClassException[] }) {
  const log: string[] = [];
  const store = {
    listWindows: async (staffId?: string) => (log.push("listWindows"), rows.windows.filter((w) => !staffId || w.staffId === staffId)),
    listAvailabilityExceptions: async (staffId: string | undefined) => (log.push("listAvailabilityExceptions"), (rows.availExceptions ?? []).filter((e) => !staffId || e.staffId === staffId)),
    listSeries: async (_r: unknown, staffId?: string) => {
      log.push("listSeries");
      const list = rows.series.filter((s) => !staffId || s.staffId === staffId);
      return { series: list, exceptions: (rows.exceptions ?? []).filter((e) => list.some((s) => s.id === e.seriesId)) };
    },
  } as unknown as ScheduleStore;
  return { store, log };
}

type Over = { names?: () => Promise<Map<string, string>>; staff?: StaffRecord[] };
const deps = (identity: SchedulerIdentity, store: ScheduleStore, over: Over = {}): ScheduleDeps => ({
  identity: async () => identity,
  fetchStaff: async () => over.staff ?? [ryan, kuby, idle],
  store,
  today: () => "2026-10-19",
  studentNames: over.names ?? (async () => new Map([[S1, "Ana R."], [S2, "Ben K."], [S3, "Cy L."]])),
});
const get = async (d: ScheduleDeps, query: string) => {
  const r = await handleWeek(d, new URLSearchParams(query));
  return { status: r.status, body: await r.json() };
};

const rows = () => ({
  series: [
    series(1, A, S1, "2026-10-12", "10:00"),
    series(2, A, S1, "2026-10-19", "13:30", "one_off"),
    series(3, B, S2, "2026-10-12", "15:00"),
    series(4, A, S1, "2026-10-12", "17:00"),
  ],
  windows: [window(11, A, 1, "09:00", "14:00"), window(12, B, 1, "09:00", "18:00")],
  exceptions: [{ seriesId: ID(4), originalDate: "2026-10-19", kind: "cancelled" as const, newDate: null, newStartTime: null }],
});

describe("GET week: access (AC1, AC2)", () => {
  it("a teacher without staffId gets their own week, Monday to Sunday", async () => {
    const f = fakeStore(rows());
    const { status, body } = await get(deps(teacher, f.store), "date=2026-10-21");
    expect(status).toBe(200);
    expect(body.weekStart).toBe("2026-10-19");
    expect(body.teachers).toHaveLength(1);
    expect(body.teachers[0].staff.id).toBe(A);
    expect(body.teachers[0].days.map((d: { date: string }) => d.date)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(body.teachers[0].occurrences.every((o: { staffId: string }) => o.staffId === A)).toBe(true);
  });
  it("a teacher may pass their own staffId", async () => {
    const { status } = await get(deps(teacher, fakeStore(rows()).store), `date=2026-10-21&staffId=${A}`);
    expect(status).toBe(200);
  });
  it("defaults to the week containing today when date is omitted", async () => {
    const { body } = await get(deps(teacher, fakeStore(rows()).store), "");
    expect(body.weekStart).toBe("2026-10-19");
    expect(body.today).toBe("2026-10-19");
  });
  it("a teacher asking for another teacher gets 403 and the store is never read", async () => {
    const f = fakeStore(rows());
    expect((await get(deps(teacher, f.store), `staffId=${B}`)).status).toBe(403);
    expect(f.log).toEqual([]);
  });
  it("a teacher asking for view=all gets 403 and the store is never read", async () => {
    const f = fakeStore(rows());
    expect((await get(deps(teacher, f.store), "view=all")).status).toBe(403);
    expect(f.log).toEqual([]);
  });
  it("signed out is 401, unconfigured is 503, none is 403", async () => {
    const f = fakeStore(rows());
    expect((await get(deps({ scope: "signed_out" }, f.store), "")).status).toBe(401);
    expect((await get(deps({ scope: "unconfigured" }, f.store), "")).status).toBe(503);
    expect((await get(deps({ scope: "none" }, f.store), "")).status).toBe(403);
    expect(f.log).toEqual([]);
  });
  it("bad input is 400", async () => {
    const d = deps(admin, fakeStore(rows()).store);
    for (const q of ["date=2026-13-40", "date=nope", "staffId=not-a-guid", "view=other"]) expect((await get(d, q)).status, q).toBe(400);
  });
});

describe("GET week: admin (AC3, AC4)", () => {
  it("one teacher by staffId", async () => {
    const { status, body } = await get(deps(admin, fakeStore(rows()).store), `date=2026-10-19&staffId=${B}`);
    expect(status).toBe(200);
    expect(body.teachers.map((t: { staff: { id: string } }) => t.staff.id)).toEqual([B]);
  });
  it("view=all lists every active teacher sorted by name, including one with no classes", async () => {
    const { body } = await get(deps(admin, fakeStore(rows()).store, { staff: [ryan, kuby, idle, mk("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "gone", { status: "Inactive" })] }), "date=2026-10-19&view=all");
    expect(body.teachers.map((t: { staff: { name: string } }) => t.staff.name)).toEqual(["kuby", "ryan", "zed"]);
    expect(body.teachers[2].occurrences).toEqual([]);
  });
  it("a staffId that is not active teaching staff is 422 invalid_staff", async () => {
    const r = await get(deps(admin, fakeStore(rows()).store), `staffId=${"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}`);
    expect(r).toMatchObject({ status: 422, body: { error: "invalid_staff" } });
  });
  it("the admin shape adds seriesUpdatedAt and email; the teacher shape has neither", async () => {
    const a = await get(deps(admin, fakeStore(rows()).store), `date=2026-10-19&staffId=${A}`);
    expect(WeekResponseAdmin.safeParse(a.body).success).toBe(true);
    expect(a.body.teachers[0].staff.email).toBe("ryan@example.com");
    expect(a.body.teachers[0].occurrences[0].seriesUpdatedAt).toBe(STAMP);
    const t = await get(deps(teacher, fakeStore(rows()).store), "date=2026-10-19");
    expect(WeekResponseTeacher.safeParse(t.body).success).toBe(true);
    const text = JSON.stringify(t.body);
    expect(text).not.toContain("email");
    expect(text).not.toContain("seriesUpdatedAt");
    expect(text).not.toContain("Weekly Schedule");
  });
  it("occurrences carry purpose in both shapes (REQ-31 AC14)", async () => {
    const r = rows();
    r.series[1] = { ...r.series[1], purpose: "makeup" };
    for (const who of [admin, teacher]) {
      const res = await get(deps(who, fakeStore(r).store), `date=2026-10-19&staffId=${A}`);
      expect(res.status).toBe(200);
      const occ = res.body.teachers[0].occurrences as { kind: string; purpose: string | null }[];
      expect(occ.find((o) => o.kind === "one_off")!.purpose).toBe("makeup");
      expect(occ.filter((o) => o.kind === "weekly").every((o) => o.purpose === null)).toBe(true);
    }
  });
  it("strict schemas reject extra fields", () => {
    const t = {
      weekStart: "2026-10-19", today: "2026-10-19", namesLoaded: true,
      teachers: [{ staff: { id: A, name: "r", subjects: [], email: "x" }, days: [], occurrences: [], totals: { scheduledMinutes: 0, availableMinutes: null, remainingMinutes: null } }],
    };
    expect(WeekResponseTeacher.safeParse(t).success).toBe(false);
  });
});

describe("GET week: content (AC5-AC8)", () => {
  it("totals come from the week's occurrences and availability", async () => {
    const { body } = await get(deps(teacher, fakeStore(rows()).store), "date=2026-10-19");
    // Mon 10:00 weekly (60) and Mon 13:30 one-off (60); the 17:00 class is cancelled on the 19th, the others repeat on other days.
    const t = body.teachers[0].totals;
    expect(t.availableMinutes).toBe(300);
    expect(t.scheduledMinutes).toBe(120 + 0);
    expect(t.remainingMinutes).toBe(300 - 90);
  });
  it("a teacher with nothing entered gets null availability and remaining", async () => {
    const r = rows();
    r.windows = [];
    const { body } = await get(deps(teacher, fakeStore(r).store), "date=2026-10-19");
    expect(body.teachers[0].totals.availableMinutes).toBeNull();
    expect(body.teachers[0].totals.remainingMinutes).toBeNull();
  });
  it("studentName is filled only for students in the returned occurrences", async () => {
    const { body } = await get(deps(teacher, fakeStore(rows()).store), "date=2026-10-19");
    const text = JSON.stringify(body);
    expect(text).toContain("Ana R.");
    expect(text).not.toContain("Ben K.");
    expect(text).not.toContain("Cy L.");
    expect(body.namesLoaded).toBe(true);
  });
  it("only the ids in the caller's occurrences are looked up", async () => {
    let asked = 0;
    const d = deps(teacher, fakeStore(rows()).store, { names: async () => (asked++, new Map([[S1, "Ana R."]])) });
    await get(d, "date=2026-10-19");
    expect(asked).toBe(1);
  });
  it("a failed names lookup gives null names and still 200", async () => {
    const { status, body } = await get(deps(teacher, fakeStore(rows()).store, { names: async () => { throw new Error("notion down"); } }), "date=2026-10-19");
    expect(status).toBe(200);
    expect(body.namesLoaded).toBe(false);
    expect(body.teachers[0].occurrences.every((o: { studentName: string | null }) => o.studentName === null)).toBe(true);
  });
  it("a student missing from Notion has a null name", async () => {
    const { body } = await get(deps(teacher, fakeStore(rows()).store, { names: async () => new Map() }), "date=2026-10-19");
    expect(body.teachers[0].occurrences.every((o: { studentName: string | null }) => o.studentName === null)).toBe(true);
    expect(body.namesLoaded).toBe(true);
  });
  it("conflict is set on a future outside-hours class, and null on past and cancelled ones", async () => {
    const fut = (await get(deps(teacher, fakeStore(rows()).store), "date=2026-10-19")).body.teachers[0].occurrences;
    const outside = fut.find((o: { startTime: string; date: string }) => o.startTime === "13:30");
    expect(outside.conflict).toBe("outside_availability");
    expect(fut.find((o: { startTime: string; date: string }) => o.startTime === "10:00").conflict).toBeNull();
    const cancelled = fut.find((o: { status: string }) => o.status === "cancelled");
    expect(cancelled.conflict).toBeNull();
    const d = deps(teacher, fakeStore(rows()).store);
    const past = (await get({ ...d, today: () => "2026-10-27" }, "date=2026-10-19")).body.teachers[0].occurrences;
    expect(past.every((o: { conflict: string | null }) => o.conflict === null)).toBe(true);
  });
});

describe("loadWeek (AC9)", () => {
  it("reports the denial status for the page", async () => {
    const f = fakeStore(rows());
    const r = await loadWeek(deps(teacher, f.store), { staffId: B });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(f.log).toEqual([]);
  });
});

describe("source scan (AC18)", () => {
  const root = resolve(__dirname, "../../..");
  const files = ["lib/domain/schedule/week.ts", "lib/view/week-layout.ts", "lib/view/week-text.ts", "app/api/scheduler/week/route.ts", "app/schedule/page.tsx",
    "components/scheduler/week-controls.tsx", "components/scheduler/week-grid.tsx", "components/scheduler/class-card.tsx", "components/scheduler/all-teachers-week.tsx"];
  it("the week files never write classes, Notion, lessons or payouts, and never log", () => {
    for (const f of files) {
      const src = readFileSync(join(root, f), "utf8");
      expect(src, f).not.toMatch(/lockedWrite|createSeries|upsertException|\.split\(\{|adoptStudent|markSummary|createWindow|updateWindow|deleteWindow|writeWeeklySchedule|lessons|payout|PATCH/i);
      expect(src, f).not.toMatch(/api\.notion\.com|console\./);
    }
  });
  it("loadWeek and handleWeek call no store write method", () => {
    const src = readFileSync(join(root, "lib/scheduler/schedule-handlers.ts"), "utf8");
    const section = src.slice(src.indexOf("// Week ---"), src.indexOf("// Classes ---"));
    expect(section).toContain("loadWeek");
    expect(section).not.toMatch(/store\.(create|update|delete|upsert|split|adopt|mark)/);
  });
});

describe("REQ-39 AC11: lesson status on the week", () => {
  // Week of Mon 2026-10-12 (today is Mon 2026-10-19): Ryan's Mon 16:00 weekly for S1, moved Tue 13 -> the 13th is a pattern date of p2.
  const p = series(1, A, S1, "2026-09-28", "16:00");
  const p2 = series(2, A, S2, "2026-09-29", "17:00");
  const k = series(3, B, S3, "2026-09-30", "15:00");
  const outcomesOf = (rows: OutcomeRecord[], fail = false): OutcomeStore => ({
    listForOccurrences: async (keys) => {
      if (fail) throw new Error("down");
      return rows.filter((r) => keys.some((x) => x.seriesId === r.seriesId && x.originalDate === r.originalDate));
    },
  } as OutcomeStore);
  const row = (seriesId: string, originalDate: string, over: Partial<OutcomeRecord> = {}): OutcomeRecord => ({
    id: ID(90), seriesId, originalDate, outcome: "delivered", linkSource: "logged", notionLessonId: "e0000000-0000-4000-8000-00000000000a",
    lessonDate: originalDate, claimedAt: null, ...over,
  });
  const withOutcomes = (identity: SchedulerIdentity, outcomes: OutcomeStore, exceptions: ClassException[] = []) => ({
    ...deps(identity, fakeStore({ series: [p, p2, k], windows: [], exceptions }).store),
    outcomes,
    lessons: {} as ScheduleDeps["lessons"],
    now: () => Date.parse("2026-10-19T18:00:00Z"),
  });
  const occ = (body: { teachers: { occurrences: { seriesId: string; originalDate: string }[] }[] }, seriesId: string, originalDate: string) =>
    body.teachers.flatMap((t) => t.occurrences).find((o) => o.seriesId === seriesId && o.originalDate === originalDate) as Record<string, unknown>;

  it("a past occurrence is linkable and carries its stored outcome; a moved one gets the outcome under its original date", async () => {
    const moved: ClassException = { seriesId: p2.id, originalDate: "2026-10-13", kind: "moved", newDate: "2026-10-15", newStartTime: "17:00" };
    const r = await get(withOutcomes(admin, outcomesOf([row(p.id, "2026-10-12"), row(p2.id, "2026-10-13", { outcome: "no_show", linkSource: null, notionLessonId: null, lessonDate: null })]), [moved]), `date=2026-10-12&staffId=${A}`);
    expect(r.status).toBe(200);
    expect(r.body.lessonsEnabled).toBe(true);
    expect(r.body.outcomesLoaded).toBe(true);
    expect(occ(r.body, p.id, "2026-10-12")).toMatchObject({ linkable: true, outcome: { state: "delivered", lessonDate: "2026-10-12", lessonUrl: "https://www.notion.so/e000000000004000800000000000000a" } });
    expect(occ(r.body, p2.id, "2026-10-13")).toMatchObject({ date: "2026-10-15", linkable: true, outcome: { state: "no_show" } });
  });

  it("future and cancelled occurrences are not linkable", async () => {
    const cancelled: ClassException = { seriesId: p.id, originalDate: "2026-10-19", kind: "cancelled", newDate: null, newStartTime: null };
    const r = await get(withOutcomes(admin, outcomesOf([]), [cancelled]), `date=2026-10-19&staffId=${A}`);
    expect(occ(r.body, p.id, "2026-10-19")).toMatchObject({ status: "cancelled", linkable: false, outcome: null });
    expect(occ(r.body, p2.id, "2026-10-20")).toMatchObject({ linkable: false, outcome: null });
  });

  it("a stale claim shows as logging with stale true; a fresh one with stale false", async () => {
    const stale = row(p.id, "2026-10-12", { notionLessonId: null, lessonDate: null, claimedAt: "2026-10-19T17:58:00.000Z" });
    const fresh = row(p2.id, "2026-10-13", { id: ID(91), notionLessonId: null, lessonDate: null, claimedAt: "2026-10-19T17:59:30.000Z" });
    const r = await get(withOutcomes(admin, outcomesOf([stale, fresh])), `date=2026-10-12&staffId=${A}`);
    expect(occ(r.body, p.id, "2026-10-12").outcome).toEqual({ state: "logging", stale: true });
    expect(occ(r.body, p2.id, "2026-10-13").outcome).toEqual({ state: "logging", stale: false });
  });

  it("an outcome read that throws still loads the week, with outcomesLoaded false", async () => {
    const r = await get(withOutcomes(admin, outcomesOf([], true)), `date=2026-10-12&staffId=${A}`);
    expect(r.status).toBe(200);
    expect(r.body.outcomesLoaded).toBe(false);
    expect(occ(r.body, p.id, "2026-10-12").outcome).toBeNull();
  });

  it("the teacher response has the fields for the teacher's own classes only", async () => {
    const r = await get(withOutcomes(teacher, outcomesOf([row(p.id, "2026-10-12"), row(k.id, "2026-10-14", { id: ID(92) })])), "date=2026-10-12");
    expect(WeekResponseTeacher.safeParse(r.body).success).toBe(true);
    const all = r.body.teachers.flatMap((t: { occurrences: { seriesId: string }[] }) => t.occurrences);
    expect(all.every((o: { seriesId: string }) => o.seriesId !== k.id)).toBe(true);
    expect(occ(r.body, p.id, "2026-10-12")).toMatchObject({ linkable: true, outcome: { state: "delivered" } });
  });

  it("without the lessons wiring, nothing is linkable-actionable and no outcome is read", async () => {
    const r = await get(deps(admin, fakeStore({ series: [p], windows: [] }).store), `date=2026-10-12&staffId=${A}`);
    expect(WeekResponseAdmin.safeParse(r.body).success).toBe(true);
    expect(r.body.lessonsEnabled).toBe(false);
    expect(occ(r.body, p.id, "2026-10-12")).toMatchObject({ linkable: true, outcome: null });
  });
});
