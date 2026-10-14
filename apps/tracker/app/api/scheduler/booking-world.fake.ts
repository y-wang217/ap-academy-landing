import type { ClassException } from "../../../lib/domain/schedule/recurrence";
import { addDays } from "../../../lib/domain/schedule/wallclock";
import type { StaffRecord } from "../../../lib/notion/staff";
import type { StudentRecord } from "../../../lib/notion/students";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import type { ScheduleDeps } from "../../../lib/scheduler/schedule-handlers";
import type { AvailabilityExceptionRecord, ScheduleStore, SeriesRecord, StoreResult, SummaryRecord, WindowRecord } from "../../../lib/scheduler/schedule-store";
import { seriesWrites } from "./series-writes.fake";

// The booking fixture of the REQ-7 design: today is Mon 2026-10-19.
export const TODAY = "2026-10-19";
export const ORG = "10000000-0000-4000-8000-000000000001";
export const RYAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const KUBY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const MIA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const S1 = "11111111-1111-4111-8111-111111111111";
export const S2 = "22222222-2222-4222-8222-222222222222";
export const REQ = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mk = (id: string, name: string): StaffRecord => ({ id, name, email: `${name}@example.com`, functions: ["Teacher"], status: "Active", subjects: ["MHF4U"] });
export const staff = [mk(RYAN, "Ryan"), mk(KUBY, "Kuby"), mk(MIA, "Mia")];
export const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
export const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: staff[0] };

const WRITES = ["createSeries", "upsertException", "split", "endSeries", "updateSeriesFields", "adoptStudent", "markSummary"] as const;

export function world() {
  const series = new Map<string, SeriesRecord>();
  const exceptions: (ClassException & { requestId: string })[] = [];
  const byRequest = new Map<string, string>();
  const writes: string[] = [];
  let n = 100;
  let tick = 0;
  const windows: WindowRecord[] = [RYAN, KUBY].flatMap((staffId) =>
    [1, 2, 3, 4, 5].map((weekday) => ({ id: REQ(++n), staffId, weekday, startTime: "15:00", endTime: "21:00", effectiveFrom: "2026-01-01", effectiveUntil: null, updatedAt: "x" })));
  const avEx: AvailabilityExceptionRecord[] = [{ id: REQ(++n), staffId: RYAN, onDate: "2026-11-02", kind: "time_off", startTime: null, endTime: null, updatedAt: "x" }];
  const summaries = new Map<string, SummaryRecord>(
    [S1, S2].map((studentId) => [studentId, { id: REQ(++n), studentId, adoptedAt: TODAY, adoptedFromText: "", lastWrittenText: "", lastWrittenAt: null, syncState: "synced", lastError: null, lastDriftText: null }]),
  );
  const notion = new Map<string, StudentRecord>([S1, S2].map((id) => [id, { id, name: id.slice(0, 2), stage: "Active", weeklySchedule: "" }]));
  const notionWrites: string[] = [];

  const base: ScheduleStore = {
    listWindows: async (staffId) => windows.filter((w) => !staffId || w.staffId === staffId),
    listAvailabilityExceptions: async (staffId, r) => avEx.filter((e) => (!staffId || e.staffId === staffId) && e.onDate >= r.from && e.onDate <= r.to),
    getWindow: async () => null, createWindow: async () => ({ ok: false, status: 503, error: "unavailable" }), updateWindow: async () => ({ ok: false, status: 503, error: "unavailable" }),
    deleteWindow: async () => false, getAvailabilityException: async () => null, createAvailabilityException: async () => ({ ok: false, status: 503, error: "unavailable" }),
    deleteAvailabilityException: async () => false,
    listSeries: async (_r, staffId) => ({ series: [...series.values()].filter((s) => !staffId || s.staffId === staffId), exceptions }),
    getSeries: async (id) => series.get(id) ?? null,
    getSeriesByRequest: async (r) => (byRequest.has(r) ? series.get(byRequest.get(r)!) ?? null : null),
    createSeries: async (input) => {
      const existing = byRequest.get(input.requestId);
      if (existing) return { ok: true, value: series.get(existing)!, created: false };
      const { requestId, ...fields } = input;
      const rec: SeriesRecord = { ...fields, id: REQ(++n), updatedAt: "2026-10-14T12:00:00.000Z", splitFrom: null };
      series.set(rec.id, rec);
      byRequest.set(requestId, rec.id);
      return { ok: true, value: rec, created: true };
    },
    upsertException: async (input) => {
      const i = exceptions.findIndex((e) => e.seriesId === input.seriesId && e.originalDate === input.originalDate);
      if (i >= 0) exceptions[i] = input;
      else exceptions.push(input);
      return { ok: true, value: input, created: i < 0 };
    },
    split: async (input): Promise<StoreResult<SeriesRecord>> => {
      const done = byRequest.get(input.requestId);
      if (done) return { ok: true, value: series.get(done)!, created: false };
      const old = series.get(input.seriesId)!;
      if (old.updatedAt !== input.expectedUpdatedAt) return { ok: false, status: 409, error: "stale" };
      const rec: SeriesRecord = { ...old, ...input.changes, id: REQ(++n), startDate: input.fromDate, splitFrom: old.id, updatedAt: "2026-10-14T14:00:00.000Z" };
      series.set(rec.id, rec);
      series.set(old.id, { ...old, effectiveUntil: addDays(input.fromDate, -1), updatedAt: `2026-10-14T15:00:${String(++tick).padStart(2, "0")}.000Z` });
      byRequest.set(input.requestId, rec.id);
      return { ok: true, value: rec, created: true };
    },
    ...seriesWrites(series, () => `2026-10-14T15:00:${String(++tick).padStart(2, "0")}.000Z`),
    listSeriesForStudent: async (studentId) => {
      const own = [...series.values()].filter((s) => s.studentId === studentId);
      return { series: own, exceptions: exceptions.filter((e) => own.some((s) => s.id === e.seriesId)) };
    },
    getSummary: async (studentId) => summaries.get(studentId) ?? null,
    listSummaries: async () => [...summaries.values()],
    adoptStudent: async () => ({ ok: false, status: 503, error: "unavailable" }),
    markSummary: async () => true,
  };
  // Every write method is spied: an attempt that is refused must leave this list empty.
  const store = new Proxy(base, {
    get(target, key: string) {
      const v = target[key as keyof ScheduleStore];
      return (WRITES as readonly string[]).includes(key) && typeof v === "function"
        ? (...args: unknown[]) => { writes.push(key); return (v as (...a: unknown[]) => unknown)(...args); }
        : v;
    },
  });
  const deps = (identity: SchedulerIdentity = admin): ScheduleDeps => ({
    identity: async () => identity, fetchStaff: async () => staff, store, today: () => TODAY,
    students: {
      list: async () => [...notion.values()], get: async (id) => notion.get(id) ?? null,
      write: async (id, text) => { notionWrites.push(id); notion.set(id, { ...notion.get(id)!, weeklySchedule: text }); },
    },
  });
  const seed = async (over: Record<string, unknown>) => {
    const r = await base.createSeries({ requestId: REQ(++n), staffId: RYAN, studentId: S1, subject: "MHF4U", kind: "weekly", startDate: "2026-10-19", startTime: "16:00", durationMinutes: 60, effectiveUntil: null, ...over } as never);
    if (!r.ok) throw new Error("seed failed");
    return r.value;
  };
  return { store, series, exceptions, writes, notionWrites, deps, seed };
}

export async function fixture() {
  const w = world();
  const s1 = await w.seed({}); // S1: weekly with Ryan, Mon 16:00-17:00
  const s2 = await w.seed({ staffId: KUBY, studentId: S2, startDate: "2026-10-21", startTime: "17:00" }); // S2: weekly with Kuby, Wed 17:00-18:00
  return { ...w, s1, s2, begin: () => { w.writes.length = 0; w.notionWrites.length = 0; } };
}
