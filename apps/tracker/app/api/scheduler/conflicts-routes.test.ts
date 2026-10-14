import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StaffRecord } from "../../../lib/notion/staff";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import {
  handleConflicts, handleCreateAvailabilityException, handleCreateClass, handleCreateWindow, handleDeleteWindow, loadConflicts, type ScheduleDeps,
} from "../../../lib/scheduler/schedule-handlers";
import type { AvailabilityExceptionRecord, ScheduleStore, SeriesRecord, WindowRecord } from "../../../lib/scheduler/schedule-store";

const ORG = "10000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STUDENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REQ = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mk = (id: string, name: string): StaffRecord => ({ id, name, email: `${name}@example.com`, functions: ["Teacher"], status: "Active", subjects: ["MHF4U"] });
const ryan = mk(A, "ryan");
const kuby = mk(B, "kuby");
const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: ryan };

function fakeStore() {
  const series = new Map<string, SeriesRecord>();
  const windows = new Map<string, WindowRecord>();
  const exceptions = new Map<string, AvailabilityExceptionRecord>();
  const byRequest = new Map<string, string>();
  let n = 100;
  const store = {
    listWindows: async (staffId?: string) => [...windows.values()].filter((w) => !staffId || w.staffId === staffId),
    listAvailabilityExceptions: async (staffId: string | undefined, r: { from: string; to: string }) =>
      [...exceptions.values()].filter((e) => (!staffId || e.staffId === staffId) && e.onDate >= r.from && e.onDate <= r.to),
    getWindow: async (id: string) => windows.get(id) ?? null,
    createWindow: async (input: Omit<WindowRecord, "id" | "updatedAt"> & { requestId: string }) => {
      const { requestId, ...fields } = input;
      const rec: WindowRecord = { ...fields, id: REQ(++n), updatedAt: "2026-10-14T12:00:00.000Z" };
      windows.set(rec.id, rec);
      byRequest.set(requestId, rec.id);
      return { ok: true as const, value: rec, created: true };
    },
    deleteWindow: async (id: string) => windows.delete(id),
    createAvailabilityException: async (input: Omit<AvailabilityExceptionRecord, "id" | "updatedAt"> & { requestId: string }) => {
      const { requestId, ...fields } = input;
      const rec: AvailabilityExceptionRecord = { ...fields, id: REQ(++n), updatedAt: "2026-10-14T12:00:00.000Z" };
      exceptions.set(rec.id, rec);
      void requestId;
      return { ok: true as const, value: rec, created: true };
    },
    listSeries: async (_r: unknown, staffId?: string) => ({ series: [...series.values()].filter((s) => !staffId || s.staffId === staffId), exceptions: [] }),
    createSeries: async (input: Omit<SeriesRecord, "id" | "updatedAt" | "splitFrom"> & { requestId: string }) => {
      const { requestId, ...fields } = input;
      const rec: SeriesRecord = { ...fields, id: REQ(++n), updatedAt: "2026-10-14T12:00:00.000Z", splitFrom: null };
      series.set(rec.id, rec);
      void requestId;
      return { ok: true as const, value: rec, created: true };
    },
  } as unknown as ScheduleStore;
  return { store, series, windows, exceptions };
}

const deps = (identity: SchedulerIdentity, store: ScheduleStore): ScheduleDeps => ({
  identity: async () => identity,
  fetchStaff: async () => [ryan, kuby],
  store,
  today: () => "2026-10-14",
});
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const q = (s: string) => new URLSearchParams(s);
const RANGE = "from=2026-10-14&to=2026-11-10";
let r = 0;
const win = (staffId: string, over: Record<string, unknown> = {}) => ({
  requestId: REQ(++r), staffId, weekday: 1, startTime: "09:00", endTime: "12:00", effectiveFrom: "2026-01-05", effectiveUntil: null, ...over,
});
const cls = (staffId: string, over: Record<string, unknown> = {}) => ({
  requestId: REQ(++r + 500), staffId, studentId: STUDENT, subject: "MHF4U", kind: "weekly", startDate: "2026-10-19", startTime: "10:00",
  durationMinutes: 60, effectiveUntil: null, ...over,
});

async function seed() {
  const f = fakeStore();
  await handleCreateWindow(deps(admin, f.store), win(A));
  await handleCreateClass(deps(admin, f.store), cls(A));
  await handleCreateClass(deps(admin, f.store), cls(B, { startTime: "15:00" }));
  return f;
}

describe("GET conflicts (AC8)", () => {
  it("admin sees every teacher; teacher B has nothing entered so is listed, not flagged", async () => {
    const { store } = await seed();
    await handleCreateClass(deps(admin, store), cls(A, { startTime: "14:00" }));
    const res = await json(await handleConflicts(deps(admin, store), q(RANGE)));
    expect(res.status).toBe(200);
    expect(res.body.notEntered).toEqual([B]);
    expect(res.body.conflicts.map((c: { staffId: string; startTime: string }) => [c.staffId, c.startTime])).toEqual(
      [[A, "14:00"], [A, "14:00"], [A, "14:00"], [A, "14:00"]],
    );
    expect(res.body.conflicts[0].reason).toBe("outside_availability");
    expect(res.body.conflicts[0].seriesUpdatedAt).toBeTruthy();
  });
  it("admin can filter by staffId", async () => {
    const { store } = await seed();
    const res = await json(await handleConflicts(deps(admin, store), q(`${RANGE}&staffId=${B}`)));
    expect(res.body).toMatchObject({ conflicts: [], notEntered: [B] });
  });
  it("a teacher gets only their own, in the teacher shape, with reason", async () => {
    const { store } = await seed();
    await handleCreateClass(deps(admin, store), cls(A, { startTime: "14:00", startDate: "2026-10-20" }));
    const res = await json(await handleConflicts(deps(teacher, store), q(RANGE)));
    expect(res.status).toBe(200);
    expect(res.body.conflicts.length).toBeGreaterThan(0);
    expect(Object.keys(res.body.conflicts[0]).sort()).toEqual([
      "date", "durationMinutes", "endTime", "endsAt", "kind", "occurrenceKey", "originalDate", "reason", "seriesId",
      "staffId", "startTime", "startsAt", "status", "studentId", "subject",
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/seriesUpdatedAt|notEntered|example\.com/);
  });
  it("a teacher naming another staffId is 403; 401, 503 and range errors", async () => {
    const { store } = await seed();
    expect((await json(await handleConflicts(deps(teacher, store), q(`${RANGE}&staffId=${B}`)))).status).toBe(403);
    expect((await json(await handleConflicts(deps({ scope: "signed_out" }, store), q(RANGE)))).status).toBe(401);
    expect((await json(await handleConflicts(deps({ scope: "unconfigured" }, store), q(RANGE)))).status).toBe(503);
    expect((await json(await handleConflicts(deps(admin, store), q("from=2026-10-20&to=2026-10-19")))).status).toBe(400);
    expect((await json(await handleConflicts(deps(admin, store), q("from=2026-01-01&to=2026-04-03")))).status).toBe(400);
    expect((await json(await handleConflicts(deps(admin, store), q(`${RANGE}&staffId=nope`)))).status).toBe(400);
  });
});

describe("conflicts follow availability and never touch classes (AC4, AC9)", () => {
  it("deleting the window flags the class, class data unchanged; recreating clears it", async () => {
    const { store, series, windows } = await seed();
    const before = JSON.stringify([...series.values()]);
    expect((await json(await handleConflicts(deps(admin, store), q(`${RANGE}&staffId=${A}`)))).body.conflicts).toEqual([]);
    const id = [...windows.keys()][0];
    expect((await json(await handleDeleteWindow(deps(teacher, store), id))).status).toBe(200);
    // Teacher A now has no rows at all: not_entered, not a conflict. Add a different-day window.
    await handleCreateWindow(deps(teacher, store), win(A, { weekday: 3 }));
    const after = await json(await handleConflicts(deps(admin, store), q(`${RANGE}&staffId=${A}`)));
    expect(after.body.conflicts.length).toBeGreaterThan(0);
    expect(JSON.stringify([...series.values()])).toBe(before);
    await handleCreateWindow(deps(teacher, store), win(A));
    expect((await json(await handleConflicts(deps(admin, store), q(`${RANGE}&staffId=${A}`)))).body.conflicts).toEqual([]);
  });
  it("time off flags the class with reason time_off; extra hours help only their date", async () => {
    const { store } = await seed();
    await handleCreateAvailabilityException(deps(teacher, store), {
      requestId: REQ(900), staffId: A, onDate: "2026-10-19", kind: "time_off", startTime: null, endTime: null,
    });
    const res = await json(await handleConflicts(deps(admin, store), q(`${RANGE}&staffId=${A}`)));
    expect(res.body.conflicts.map((c: { date: string; reason: string }) => [c.date, c.reason])).toEqual([["2026-10-19", "time_off"]]);
    // Time off wins over extra hours on the same date (engine rule), so test extra on its own date.
    await handleCreateClass(deps(admin, store), cls(A, { startDate: "2026-10-21", startTime: "14:00" }));
    await handleCreateAvailabilityException(deps(teacher, store), {
      requestId: REQ(901), staffId: A, onDate: "2026-10-21", kind: "extra", startTime: "13:00", endTime: "15:00",
    });
    const next = await json(await handleConflicts(deps(admin, store), q(`${RANGE}&staffId=${A}`)));
    expect(next.body.conflicts.map((c: { date: string }) => c.date)).toEqual(["2026-10-19", "2026-10-28", "2026-11-04"]);
  });
  it("loadConflicts is read-only (shared by the page and the route)", async () => {
    const { store, series } = await seed();
    const n = series.size;
    const out = await loadConflicts(deps(admin, store), admin as never, { from: "2026-10-14", to: "2026-11-10" });
    expect(out.notEntered).toEqual([B]);
    expect(series.size).toBe(n);
  });
});

describe("source scan (AC9, AC13)", () => {
  const root = resolve(__dirname, "../../..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(p);
    }
  };
  for (const d of ["components/scheduler", "app/schedule"]) {
    try { walk(join(root, d)); } catch { /* not created yet */ }
  }
  for (const f of ["lib/domain/schedule/conflicts.ts", "lib/domain/schedule/copy-day.ts", "lib/scheduler/api-client.ts", "lib/view/availability-text.ts"]) {
    try { files.push(join(root, f)); statSync(join(root, f)); } catch { files.pop(); }
  }
  it("new files never write classes, students, Notion, lessons or payouts", () => {
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/createSeries|upsertException|\.split\(\{|adoptStudent|markSummary|class_series|class_exceptions|writeWeeklySchedule|lessons|payout|from\("students"\)/i);
      expect(src, f).not.toMatch(/api\.notion\.com|fetch\(["'`]https?:/);
    }
  });
  it("the conflicts handler calls only reads", () => {
    const src = readFileSync(join(root, "lib/scheduler/schedule-handlers.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function loadConflicts"), src.indexOf("// Classes ---"));
    expect(body).not.toMatch(/store\.(create|update|delete|upsert|split|adopt|mark)/);
  });
});
