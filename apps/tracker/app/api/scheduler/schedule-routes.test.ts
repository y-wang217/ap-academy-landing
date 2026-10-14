import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClassException } from "../../../lib/domain/schedule/recurrence";
import type { StaffRecord } from "../../../lib/notion/staff";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import {
  handleAvailability, handleCancelOccurrence, handleCreateClass, handleCreateWindow, handleEditOccurrence,
  handleOccurrences, handlePatchWindow, type ScheduleDeps,
} from "../../../lib/scheduler/schedule-handlers";
import type { ScheduleStore, SeriesRecord, StoreResult, WindowRecord } from "../../../lib/scheduler/schedule-store";

const ORG = "10000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STUDENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REQ = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mk = (id: string, name: string, over: Partial<StaffRecord> = {}): StaffRecord => ({
  id, name, email: `${name}@example.com`, functions: ["Teacher"], status: "Active", subjects: ["MHF4U"], ...over,
});
const ryan = mk(A, "ryan");
const kuby = mk(B, "kuby");
const inactive = mk("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "gone", { status: "Inactive" });

const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: ryan };

const withoutRequestId = <T extends { requestId: string }>({ requestId, ...rest }: T) => (void requestId, rest);

/** In-memory store with the semantics the database gives: request_id idempotency and updated_at tokens. */
function fakeStore() {
  const series = new Map<string, SeriesRecord>();
  const exceptions: (ClassException & { requestId: string })[] = [];
  const windows = new Map<string, WindowRecord>();
  const byRequest = new Map<string, string>();
  let n = 100;
  const store: ScheduleStore = {
    listWindows: async (staffId) => [...windows.values()].filter((w) => w.staffId === staffId),
    listAvailabilityExceptions: async () => [],
    getWindow: async (id) => windows.get(id) ?? null,
    createWindow: async (input) => {
      const existing = byRequest.get(input.requestId);
      if (existing) return { ok: true, value: windows.get(existing)!, created: false };
      const fields = withoutRequestId(input);
      const rec: WindowRecord = { ...fields, id: REQ(++n), updatedAt: "2026-10-14T12:00:00.000Z" };
      windows.set(rec.id, rec);
      byRequest.set(input.requestId, rec.id);
      return { ok: true, value: rec, created: true };
    },
    updateWindow: async (id, expected, changes): Promise<StoreResult<WindowRecord>> => {
      const w = windows.get(id);
      if (!w) return { ok: false, status: 404, error: "not_found" };
      if (w.updatedAt !== expected) return { ok: false, status: 409, error: "stale" };
      const next = { ...w, ...changes, updatedAt: "2026-10-14T13:00:00.000Z" };
      windows.set(id, next);
      return { ok: true, value: next, created: false };
    },
    deleteWindow: async (id) => windows.delete(id),
    getAvailabilityException: async () => null,
    createAvailabilityException: async () => ({ ok: false, status: 503, error: "unavailable" }),
    deleteAvailabilityException: async () => false,
    listSeries: async (_range, staffId) => ({
      series: [...series.values()].filter((s) => !staffId || s.staffId === staffId),
      exceptions,
    }),
    getSeries: async (id) => series.get(id) ?? null,
    createSeries: async (input) => {
      const existing = byRequest.get(input.requestId);
      if (existing) return { ok: true, value: series.get(existing)!, created: false };
      const fields = withoutRequestId(input);
      const rec: SeriesRecord = { ...fields, id: REQ(++n), updatedAt: "2026-10-14T12:00:00.000Z", splitFrom: null };
      series.set(rec.id, rec);
      byRequest.set(input.requestId, rec.id);
      return { ok: true, value: rec, created: true };
    },
    upsertException: async (input) => {
      const i = exceptions.findIndex((e) => e.seriesId === input.seriesId && e.originalDate === input.originalDate);
      if (i >= 0) exceptions[i] = input;
      else exceptions.push(input);
      return { ok: true, value: input, created: i < 0 };
    },
    split: async (input): Promise<StoreResult<SeriesRecord>> => {
      const old = series.get(input.seriesId);
      if (!old) return { ok: false, status: 404, error: "not_found" };
      if (old.updatedAt !== input.expectedUpdatedAt) return { ok: false, status: 409, error: "stale" };
      const rec: SeriesRecord = { ...old, ...input.changes, id: REQ(++n), startDate: input.fromDate, splitFrom: old.id, updatedAt: "2026-10-14T14:00:00.000Z" };
      series.set(rec.id, rec);
      return { ok: true, value: rec, created: true };
    },
  };
  return { store, series, exceptions };
}

const deps = (identity: SchedulerIdentity, store: ScheduleStore, staff: StaffRecord[] = [ryan, kuby, inactive]): ScheduleDeps => ({
  identity: async () => identity,
  fetchStaff: async () => staff,
  store,
  today: () => "2026-10-14",
});
const json = async (r: Response) => ({ status: r.status, body: await r.json(), headers: r.headers });
const newClass = (over: Record<string, unknown> = {}) => ({
  requestId: REQ(1), staffId: A, studentId: STUDENT, subject: "MHF4U", kind: "weekly",
  startDate: "2026-10-19", startTime: "17:00", durationMinutes: 60, effectiveUntil: null, ...over,
});

describe("classes: create (AC8, AC12, AC14)", () => {
  it("admin creates (201), the retry returns the same record (200)", async () => {
    const { store, series } = fakeStore();
    const first = await json(await handleCreateClass(deps(admin, store), newClass()));
    expect(first.status).toBe(201);
    const again = await json(await handleCreateClass(deps(admin, store), newClass()));
    expect(again.status).toBe(200);
    expect(again.body.series.id).toBe(first.body.series.id);
    expect(series.size).toBe(1);
    expect(first.headers.get("cache-control")).toBe("no-store");
  });
  it("teachers cannot create classes (403)", async () => {
    const { store, series } = fakeStore();
    expect((await json(await handleCreateClass(deps(teacher, store), newClass()))).status).toBe(403);
    expect(series.size).toBe(0);
  });
  it("inactive or unknown staff is 422 invalid_staff", async () => {
    const { store } = fakeStore();
    for (const staffId of [inactive.id, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]) {
      expect(await json(await handleCreateClass(deps(admin, store), newClass({ staffId })))).toMatchObject({ status: 422, body: { error: "invalid_staff" } });
    }
  });
  it("bad duration or midnight crossing is 400", async () => {
    const { store } = fakeStore();
    expect((await json(await handleCreateClass(deps(admin, store), newClass({ durationMinutes: 62 })))).status).toBe(400);
    expect((await json(await handleCreateClass(deps(admin, store), newClass({ startTime: "23:30" })))).status).toBe(400);
    expect((await json(await handleCreateClass(deps(admin, store), { subject: "x" }))).status).toBe(400);
    expect((await json(await handleCreateClass(deps(admin, store), newClass({ kind: "one_off", effectiveUntil: "2026-12-01" })))).status).toBe(400);
  });
});

describe("classes: occurrences (AC12, AC13, AC16)", () => {
  const seed = async () => {
    const f = fakeStore();
    await handleCreateClass(deps(admin, f.store), newClass());
    await handleCreateClass(deps(admin, f.store), newClass({ requestId: REQ(2), staffId: B, studentId: "ffffffff-ffff-4fff-8fff-ffffffffffff" }));
    return f;
  };
  const q = (s: string) => new URLSearchParams(s);
  it("a teacher gets only their own classes, with only the allowed keys", async () => {
    const { store } = await seed();
    const r = await json(await handleOccurrences(deps(teacher, store), q("from=2026-10-19&to=2026-10-26")));
    expect(r.status).toBe(200);
    expect(r.body.occurrences.map((o: { staffId: string }) => o.staffId)).toEqual([A, A]);
    expect(Object.keys(r.body.occurrences[0]).sort()).toEqual([
      "date", "durationMinutes", "endTime", "endsAt", "kind", "occurrenceKey", "originalDate", "seriesId",
      "staffId", "startTime", "startsAt", "status", "studentId", "subject",
    ]);
    expect(JSON.stringify(r.body)).not.toMatch(/seriesUpdatedAt|example\.com|ffffffff/);
  });
  it("a teacher naming another staffId is 403", async () => {
    const { store } = await seed();
    expect((await json(await handleOccurrences(deps(teacher, store), q(`from=2026-10-19&to=2026-10-26&staffId=${B}`)))).status).toBe(403);
  });
  it("admin sees everyone, can filter, and gets the version token", async () => {
    const { store } = await seed();
    const all = await json(await handleOccurrences(deps(admin, store), q("from=2026-10-19&to=2026-10-19")));
    expect(all.body.occurrences).toHaveLength(2);
    expect(all.body.occurrences[0].seriesUpdatedAt).toBe("2026-10-14T12:00:00.000Z");
    const one = await json(await handleOccurrences(deps(admin, store), q(`from=2026-10-19&to=2026-10-19&staffId=${B}`)));
    expect(one.body.occurrences).toHaveLength(1);
  });
  it("AC16: more than 92 days, from after to, or junk is 400", async () => {
    const { store } = await seed();
    expect((await json(await handleOccurrences(deps(admin, store), q("from=2026-01-01&to=2026-04-03")))).status).toBe(400);
    expect((await json(await handleOccurrences(deps(admin, store), q("from=2026-01-01&to=2026-04-02")))).status).toBe(200);
    expect((await json(await handleOccurrences(deps(admin, store), q("from=2026-10-20&to=2026-10-19")))).status).toBe(400);
    expect((await json(await handleOccurrences(deps(admin, store), q("from=nope&to=2026-10-19")))).status).toBe(400);
  });
  it("signed-out is 401", async () => {
    const { store } = await seed();
    expect((await json(await handleOccurrences(deps({ scope: "signed_out" }, store), q("from=2026-10-19&to=2026-10-19")))).status).toBe(401);
  });
});

describe("classes: edits (AC3, AC4, AC5, AC7, AC9)", () => {
  const setup = async (over: Record<string, unknown> = {}) => {
    const f = fakeStore();
    const created = await json(await handleCreateClass(deps(admin, f.store), newClass(over)));
    return { ...f, id: created.body.series.id as string, stamp: created.body.series.updatedAt as string };
  };
  const body = (stamp: string, over: Record<string, unknown> = {}) => ({ requestId: REQ(50), expectedUpdatedAt: stamp, ...over });

  it("cancel (this class only) writes one exception; a retry writes none more", async () => {
    const { store, id, stamp, exceptions } = await setup();
    const r = await json(await handleCancelOccurrence(deps(admin, store), id, "2026-10-26", body(stamp)));
    expect(r.status).toBe(200);
    await handleCancelOccurrence(deps(admin, store), id, "2026-10-26", body(stamp));
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({ seriesId: id, originalDate: "2026-10-26", kind: "cancelled" });
    const occ = await json(await handleOccurrences(deps(admin, store), new URLSearchParams("from=2026-10-26&to=2026-10-26")));
    expect(occ.body.occurrences[0].status).toBe("cancelled");
  });
  it("move (this class only) writes a moved exception", async () => {
    const { store, id, stamp, exceptions } = await setup();
    const r = await json(await handleEditOccurrence(deps(admin, store), id, "2026-10-26", body(stamp, { changes: { date: "2026-10-28", startTime: "18:30" } })));
    expect(r.status).toBe(200);
    expect(exceptions[0]).toMatchObject({ kind: "moved", newDate: "2026-10-28", newStartTime: "18:30" });
  });
  it("this-and-future splits the series", async () => {
    const { store, id, stamp, series } = await setup();
    const r = await json(await handleEditOccurrence(deps(admin, store), id, "2026-11-02", body(stamp, { scope: "future", changes: { startTime: "16:00" } })));
    expect(r.status).toBe(200);
    expect(series.size).toBe(2);
    expect(r.body.series.splitFrom).toBe(id);
  });
  it("AC7: a past occurrence is 422 and writes nothing", async () => {
    const { store, id, stamp, exceptions, series } = await setup({ startDate: "2026-10-05" });
    const r = await json(await handleCancelOccurrence(deps(admin, store), id, "2026-10-12", body(stamp)));
    expect(r).toMatchObject({ status: 422, body: { error: "past_occurrence" } });
    const f = await json(await handleEditOccurrence(deps(admin, store), id, "2026-10-12", body(stamp, { scope: "future", changes: {} })));
    expect(f.status).toBe(422);
    expect(exceptions).toHaveLength(0);
    expect(series.size).toBe(1);
  });
  it("AC9: a stale token is 409 and writes nothing", async () => {
    const { store, id, exceptions, series } = await setup();
    const stale = "2026-01-01T00:00:00.000Z";
    expect(await json(await handleCancelOccurrence(deps(admin, store), id, "2026-10-26", body(stale)))).toMatchObject({ status: 409, body: { error: "stale" } });
    expect((await json(await handleEditOccurrence(deps(admin, store), id, "2026-11-02", body(stale, { scope: "future", changes: {} })))).status).toBe(409);
    expect(exceptions).toHaveLength(0);
    expect(series.size).toBe(1);
  });
  it("AC12: a teacher cannot edit or cancel (403); a non-occurrence date is 404", async () => {
    const { store, id, stamp } = await setup();
    expect((await json(await handleCancelOccurrence(deps(teacher, store), id, "2026-10-26", body(stamp)))).status).toBe(403);
    expect((await json(await handleEditOccurrence(deps(teacher, store), id, "2026-10-26", body(stamp, { changes: {} })))).status).toBe(403);
    expect((await json(await handleCancelOccurrence(deps(admin, store), id, "2026-10-27", body(stamp)))).status).toBe(404);
  });
  it("moving to a non-existent time is 400", async () => {
    const { store, id, stamp } = await setup();
    expect((await json(await handleEditOccurrence(deps(admin, store), id, "2026-10-26", body(stamp, { changes: { date: "2026-10-28", startTime: "25:99" } })))).status).toBe(400);
  });
});

describe("availability (AC8, AC9, AC10, AC12)", () => {
  const win = (over: Record<string, unknown> = {}) => ({
    requestId: REQ(7), staffId: A, weekday: 1, startTime: "09:00", endTime: "12:00", effectiveFrom: "2026-10-01", effectiveUntil: null, ...over,
  });
  it("a teacher manages their own availability; the retry is a 200", async () => {
    const { store } = fakeStore();
    expect((await json(await handleCreateWindow(deps(teacher, store), win()))).status).toBe(201);
    expect((await json(await handleCreateWindow(deps(teacher, store), win()))).status).toBe(200);
  });
  it("a teacher naming another staffId is 403", async () => {
    const { store } = fakeStore();
    expect((await json(await handleCreateWindow(deps(teacher, store), win({ staffId: B })))).status).toBe(403);
    expect((await json(await handleAvailability(deps(teacher, store), new URLSearchParams(`staffId=${B}&from=2026-10-26&to=2026-10-26`)))).status).toBe(403);
  });
  it("GET returns the computed days, with not_entered when nothing exists", async () => {
    const { store } = fakeStore();
    const empty = await json(await handleAvailability(deps(teacher, store), new URLSearchParams("from=2026-10-26&to=2026-10-26")));
    expect(empty.body.days[0].state).toBe("not_entered");
    await handleCreateWindow(deps(teacher, store), win());
    await handleCreateWindow(deps(teacher, store), win({ requestId: REQ(8), startTime: "11:00", endTime: "14:00" }));
    const r = await json(await handleAvailability(deps(teacher, store), new URLSearchParams("from=2026-10-26&to=2026-10-26")));
    expect(r.body.days[0]).toEqual({ date: "2026-10-26", state: "available", intervals: [{ start: "09:00", end: "14:00" }], availableMinutes: 300 });
  });
  it("PATCH with a stale token is 409", async () => {
    const { store } = fakeStore();
    const created = await json(await handleCreateWindow(deps(teacher, store), win()));
    const id = created.body.window.id;
    expect((await json(await handlePatchWindow(deps(teacher, store), id, { expectedUpdatedAt: "2020-01-01T00:00:00.000Z", endTime: "13:00" }))).status).toBe(409);
    const ok = await json(await handlePatchWindow(deps(teacher, store), id, { expectedUpdatedAt: created.body.window.updatedAt, endTime: "13:00" }));
    expect(ok).toMatchObject({ status: 200, body: { window: { endTime: "13:00" } } });
  });
  it("a window that ends before it starts is 400", async () => {
    const { store } = fakeStore();
    expect((await json(await handleCreateWindow(deps(teacher, store), win({ startTime: "12:00", endTime: "09:00" })))).status).toBe(400);
  });
});

describe("AC15: scheduler modules never talk to Notion or write lessons, payouts or students", () => {
  const root = resolve(__dirname, "../../..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
    });
  const targets = [...files(join(root, "lib/domain/schedule")), ...files(join(root, "lib/scheduler")), join(root, "lib/data/schedule.ts")];
  it("scans the new modules", () => {
    expect(targets.length).toBeGreaterThan(8);
    for (const file of targets) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/api\.notion\.com|payout|lessons?_?(db|source)|from\(["']students["']\)/i);
      for (const m of src.matchAll(/from ["'](?:\.\.?\/)+notion\/([\w-]+)["']/g)) {
        expect(["cached", "staff", "config"], `${file} imports notion/${m[1]}`).toContain(m[1]);
      }
    }
  });
});
