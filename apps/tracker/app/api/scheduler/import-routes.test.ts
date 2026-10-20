import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClassException } from "../../../lib/domain/schedule/recurrence";
import type { StaffRecord } from "../../../lib/notion/staff";
import type { StudentRecord } from "../../../lib/notion/students";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import { handleImportPreview, handleImportRun, handleMonthlyReview, handleSyncSummaries } from "../../../lib/scheduler/import-handlers";
import { fakeOutbox } from "../../../lib/scheduler/outbox.fake";
import { lockedWrites } from "./series-writes.fake";
import { handleCancelOccurrence, handleCreateClass, handleEditOccurrence, type ScheduleDeps } from "../../../lib/scheduler/schedule-handlers";
import type { ScheduleStore, SeriesRecord, StoreResult, SummaryPatch, SummaryRecord } from "../../../lib/scheduler/schedule-store";

const ORG = "10000000-0000-4000-8000-000000000001";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const REQ = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TODAY = "2026-10-14"; // a Wednesday

const jane: StaffRecord = { id: T1, name: "Jane Doe", email: "jane@example.com", functions: ["Teacher"], status: "Active", subjects: [] };
const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: jane };

/** In-memory store with the semantics the database gives: request_id idempotency, one summary per student. */
function fakeStore() {
  const series = new Map<string, SeriesRecord>();
  const exceptions: (ClassException & { requestId: string })[] = [];
  const summaries = new Map<string, SummaryRecord>();
  const log = { adopt: 0, markSummary: 0, createSeries: 0 };
  let n = 100;
  // REQ-7: classes are checked against availability, so every teacher is open all week.
  const openWeek = (staffId: string) => [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ id: REQ(900 + weekday), staffId, weekday, startTime: "00:00", endTime: "23:55", effectiveFrom: "2026-01-01", effectiveUntil: null, updatedAt: "2026-10-14T12:00:00.000Z" }));
  const locked = lockedWrites({ series, exceptions, newId: () => REQ(++n) });
  // What adopt_student_schedule does for each imported class.
  const insertSeries = (input: Omit<SeriesRecord, "id" | "updatedAt" | "splitFrom">) => {
    log.createSeries++;
    const rec: SeriesRecord = { ...input, id: REQ(++n), updatedAt: "2026-10-14T12:00:00.000Z", splitFrom: null };
    series.set(rec.id, rec);
    locked.bump({ kind: "staff", id: rec.staffId }, { kind: "student", id: rec.studentId });
  };
  const store = {
    listWindows: async (staffId?: string) => openWeek(staffId ?? T1),
    listAvailabilityExceptions: async () => [],
    listSeries: async () => ({ series: [...series.values()], exceptions }),
    getSeries: async (id: string) => series.get(id) ?? null,
    ...locked.methods,
    listSeriesForStudent: async (studentId: string) => {
      const own = [...series.values()].filter((s) => s.studentId === studentId);
      return { series: own, exceptions: exceptions.filter((e) => own.some((s) => s.id === e.seriesId)) };
    },
    getSummary: async (studentId: string) => summaries.get(studentId) ?? null,
    listSummaries: async () => [...summaries.values()],
    adoptStudent: async (input: { studentId: string; sourceText: string; series: (Omit<SeriesRecord, "id" | "updatedAt" | "splitFrom"> & { requestId: string })[] }): Promise<StoreResult<SummaryRecord>> => {
      const existing = summaries.get(input.studentId);
      if (existing) return { ok: true, value: existing, created: false };
      log.adopt++;
      for (const { requestId, ...s } of input.series) insertSeries((void requestId, { ...s, studentId: input.studentId }));
      const rec: SummaryRecord = {
        id: REQ(++n), studentId: input.studentId, adoptedAt: TODAY, adoptedFromText: input.sourceText, lastWrittenText: null, lastWrittenAt: null,
        syncState: "pending", lastError: null, lastDriftText: null,
      };
      summaries.set(input.studentId, rec);
      return { ok: true, value: rec, created: true };
    },
    markSummary: async (studentId: string, patch: SummaryPatch) => {
      log.markSummary++;
      const row = summaries.get(studentId);
      if (!row) return false;
      summaries.set(studentId, {
        ...row, syncState: patch.syncState, lastError: patch.lastError ?? null,
        lastWrittenText: patch.lastWrittenText ?? row.lastWrittenText, lastDriftText: patch.lastDriftText ?? row.lastDriftText,
      });
      return true;
    },
  } as unknown as ScheduleStore;
  return { store, series, summaries, log, exceptions };
}

function world(initial: Record<string, string>, opts: { identity?: SchedulerIdentity } = {}) {
  const notion = new Map<string, StudentRecord>(Object.entries(initial).map(([id, text]) => [id, { id, name: `Student ${id.slice(0, 2)}`, stage: "Active", weeklySchedule: text }]));
  const f = fakeStore();
  const calls = { get: 0, list: 0, write: [] as { id: string; text: string }[] };
  let writeFails = false;
  const deps: ScheduleDeps = {
    identity: async () => opts.identity ?? admin,
    fetchStaff: async () => [jane],
    store: f.store,
    today: () => TODAY,
    students: {
      list: async () => { calls.list++; return [...notion.values()]; },
      get: async (id) => { calls.get++; return notion.get(id) ?? null; },
      write: async (id, text) => {
        if (writeFails) throw new Error("Notion returned 500");
        calls.write.push({ id, text });
        const cur = notion.get(id);
        if (cur) notion.set(id, { ...cur, weeklySchedule: text });
      },
    },
  };
  return { deps, ...f, calls, notion, failWrites: (v: boolean) => { writeFails = v; } };
}
const as = (deps: ScheduleDeps, identity: SchedulerIdentity): ScheduleDeps => ({ ...deps, identity: async () => identity });
const json = async (r: Response) => ({ status: r.status, body: await r.json(), headers: r.headers });

const CLEAN = "Tue 17:30-18:30 | MPM2D Math | Jane Doe\nFri 17:30-18:30 | MPM2D Math | Jane Doe";
const NO_TEACHER = "Wed 19:00-20:00 | Math";

describe("AC19: admin only", () => {
  it("teacher 403, signed out 401, unconfigured 503 on every new endpoint", async () => {
    const w = world({ [S1]: CLEAN });
    const call = {
      preview: (d: ScheduleDeps) => handleImportPreview(d),
      run: (d: ScheduleDeps) => handleImportRun(d, { dryRun: false }),
      sync: (d: ScheduleDeps) => handleSyncSummaries(d, {}),
      review: (d: ScheduleDeps) => handleMonthlyReview(d, new URLSearchParams("month=2026-11")),
    };
    for (const [name, fn] of Object.entries(call)) {
      expect((await fn(as(w.deps, teacher))).status, name).toBe(403);
      expect((await fn(as(w.deps, { scope: "signed_out" }))).status, name).toBe(401);
      expect((await fn(as(w.deps, { scope: "unconfigured" }))).status, name).toBe(503);
    }
    expect(w.log.adopt).toBe(0);
    expect(w.calls.write).toEqual([]);
  });
});

describe("AC9: dry run", () => {
  it("returns the same plan as a real run and writes nothing", async () => {
    const w = world({ [S1]: CLEAN, [S2]: NO_TEACHER });
    const dry = await json(await handleImportRun(w.deps, { dryRun: true }));
    expect(dry.status).toBe(200);
    expect(w.log.adopt).toBe(0);
    expect(w.log.createSeries).toBe(0);
    expect(w.calls.write).toEqual([]);
    const preview = await json(await handleImportPreview(w.deps));
    expect(preview.body.plan).toEqual(dry.body.plan);
    const real = await json(await handleImportRun(w.deps, { dryRun: false }));
    expect(real.body.plan).toEqual(dry.body.plan);
  });
});

describe("AC5, AC7, AC8: the import", () => {
  it("adopts the clean student, lists the repair lines, and syncs the summary", async () => {
    const w = world({ [S1]: CLEAN, [S2]: NO_TEACHER });
    const r = await json(await handleImportRun(w.deps, {}));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.body.results).toEqual([{ studentId: S1, name: "Student 11", status: "adopted", summarySync: "synced" }]);
    expect(r.body.plan.repair).toEqual([{ studentId: S2, name: "Student 22", lines: [{ text: NO_TEACHER, status: "missing_teacher" }] }]);
    expect([...w.series.values()].map((s) => [s.studentId, s.kind, s.startDate, s.effectiveUntil, s.staffId]).sort())
      .toEqual([[S1, "weekly", "2026-10-16", null, T1], [S1, "weekly", "2026-10-20", null, T1]]);
    expect(w.summaries.has(S2)).toBe(false);
    expect(w.calls.write).toHaveLength(1);
    expect(w.calls.write[0].id).toBe(S1);
    expect(w.calls.write[0].text.split("\n")).toHaveLength(2);
    expect(w.summaries.get(S1)?.syncState).toBe("synced");
  });

  it("a second run creates nothing new and writes nothing", async () => {
    const w = world({ [S1]: CLEAN });
    await handleImportRun(w.deps, {});
    const seriesBefore = w.series.size;
    const again = await json(await handleImportRun(w.deps, {}));
    expect(w.series.size).toBe(seriesBefore);
    expect(w.log.adopt).toBe(1);
    expect(w.calls.write).toHaveLength(1);
    expect(again.body.results).toEqual([]);
    expect(again.body.plan.skipped).toEqual([{ studentId: S1 }]);
  });

  it("rejects a malformed body", async () => {
    const w = world({});
    expect((await handleImportRun(w.deps, { dryRun: "yes" })).status).toBe(400);
    expect((await handleImportRun(w.deps, { dryRun: true, extra: 1 })).status).toBe(400);
  });

  it("a Notion outage on the student list is 503 and writes nothing", async () => {
    const w = world({ [S1]: CLEAN });
    w.deps.students!.list = async () => { throw new Error("down"); };
    expect((await handleImportRun(w.deps, {})).status).toBe(503);
    expect(w.log.adopt).toBe(0);
  });
});

describe("review: a failing store read is a 503 and writes nothing", () => {
  it("every import endpoint and the AC16 check", async () => {
    const w = world({ [S1]: CLEAN });
    const broken = (fn: keyof ScheduleStore): ScheduleDeps => ({ ...w.deps, store: { ...w.deps.store, [fn]: async () => { throw new Error("unavailable"); } } as ScheduleStore });
    const noList = broken("listSummaries");
    expect((await handleImportPreview(noList)).status).toBe(503);
    expect((await handleImportRun(noList, {})).status).toBe(503);
    expect((await handleMonthlyReview(noList, new URLSearchParams("month=2026-11"))).status).toBe(503);
    await handleImportRun(w.deps, {});
    w.calls.write.length = 0;
    const d = broken("listSeriesForStudent");
    expect((await handleMonthlyReview(d, new URLSearchParams("month=2026-11"))).status).toBe(503);
    expect(await json(await handleSyncSummaries(d, {}))).toMatchObject({ body: { results: [{ studentId: S1, summarySync: "failed" }] } });
    expect(w.calls.write).toEqual([]);
    const gs = broken("getSummary");
    const body = { requestId: REQ(7), staffId: T1, studentId: S1, subject: "M", kind: "weekly", startDate: "2026-10-21", startTime: "17:30", durationMinutes: 60, effectiveUntil: null };
    expect((await handleCreateClass(gs, body)).status).toBe(503);
  });
});

describe("AC14: a failed Notion write never fails the class write", () => {
  it("create returns 201 with summarySync failed, and the sync endpoint retries once", async () => {
    const w = world({ [S1]: "" });
    w.failWrites(true);
    const body = { requestId: REQ(1), staffId: T1, studentId: S1, subject: "MPM2D Math", kind: "weekly", startDate: "2026-10-21", startTime: "17:30", durationMinutes: 60, effectiveUntil: null };
    const r = await json(await handleCreateClass(w.deps, body));
    expect(r.status).toBe(201);
    expect(r.body.summarySync).toBe("failed");
    expect(w.series.size).toBe(1);
    expect(w.summaries.get(S1)).toMatchObject({ syncState: "failed", lastError: "Notion returned 500" });

    w.failWrites(false);
    const retry = await json(await handleSyncSummaries(w.deps, {}));
    expect(retry.body.results).toEqual([{ studentId: S1, summarySync: "synced" }]);
    expect(w.calls.write).toHaveLength(1);
    const again = await json(await handleSyncSummaries(w.deps, { studentId: S1 }));
    expect(again.body.results).toEqual([{ studentId: S1, summarySync: "synced" }]);
    expect(w.calls.write).toHaveLength(1);
  });
});

describe("REQ-28 AC7: the week editor's retry body", () => {
  it("accepts an ignored requestId, still refuses other fields, still admin only", async () => {
    const w = world({ [S1]: CLEAN });
    await handleImportRun(w.deps, { dryRun: false });
    const r = await json(await handleSyncSummaries(w.deps, { studentId: S1, requestId: REQ(41) }));
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([{ studentId: S1, summarySync: "synced" }]);
    expect((await handleSyncSummaries(w.deps, { studentId: S1, requestId: REQ(42), extra: 1 })).status).toBe(400);
    expect((await handleSyncSummaries(w.deps, { studentId: S1, requestId: "not-a-guid" })).status).toBe(400);
    expect((await handleSyncSummaries(as(w.deps, teacher), { studentId: S1, requestId: REQ(43) })).status).toBe(403);
  });
});

describe("AC16: creating a class for a student who is not adopted", () => {
  const body = (studentId: string) => ({ requestId: REQ(7), staffId: T1, studentId, subject: "MPM2D Math", kind: "weekly", startDate: "2026-10-21", startTime: "17:30", durationMinutes: 60, effectiveUntil: null });
  it("legacy text present: 409 legacy_schedule_pending and nothing written", async () => {
    const w = world({ [S1]: CLEAN });
    expect(await json(await handleCreateClass(w.deps, body(S1)))).toMatchObject({ status: 409, body: { error: "legacy_schedule_pending" } });
    expect(w.series.size).toBe(0);
    expect(w.summaries.size).toBe(0);
    expect(w.calls.write).toEqual([]);
  });
  it("legacy text empty: the student is adopted, the class is created and the summary synced", async () => {
    const w = world({ [S1]: "" });
    const r = await json(await handleCreateClass(w.deps, body(S1)));
    expect(r).toMatchObject({ status: 201, body: { summarySync: "synced" } });
    expect(w.summaries.get(S1)).toBeDefined();
    expect(w.calls.write[0].text).toBe("Wed 17:30-18:30 | MPM2D Math | Jane Doe | from 2026-10-21");
  });
  it("an adopted student needs no legacy check", async () => {
    const w = world({ [S1]: CLEAN });
    await handleImportRun(w.deps, {});
    const before = w.calls.get;
    const r = await json(await handleCreateClass(w.deps, body(S1)));
    expect(r.status).toBe(201);
    expect(w.calls.get).toBeGreaterThan(before); // the sync reads the page, the legacy check does not run
    expect(w.calls.write.length).toBe(2);
  });
  it("a student missing from Notion is 422 invalid_student", async () => {
    const w = world({});
    expect(await json(await handleCreateClass(w.deps, body(S3)))).toMatchObject({ status: 422, body: { error: "invalid_student" } });
  });
});

describe("AC13: when the summary is rewritten", () => {
  async function adopted() {
    const w = world({ [S1]: CLEAN, [S2]: "" });
    await handleImportRun(w.deps, {});
    // S2 gets a first class so it is adopted too.
    await handleCreateClass(w.deps, { requestId: REQ(9), staffId: T1, studentId: S2, subject: "Chem", kind: "weekly", startDate: "2026-10-22", startTime: "10:00", durationMinutes: 60, effectiveUntil: null });
    w.calls.write.length = 0;
    return w;
  }
  it("a 'this class and future' split regenerates both students; move and cancel make no Notion call", async () => {
    const w = await adopted();
    const target = [...w.series.values()].find((s) => s.studentId === S1 && s.startDate === "2026-10-20")!;
    const g0 = w.calls.get;
    const l0 = w.calls.list;

    const mv = await json(await handleEditOccurrence(w.deps, target.id, "2026-10-27", { requestId: REQ(20), expectedUpdatedAt: target.updatedAt, scope: "this", changes: { date: "2026-10-28", startTime: "18:00" } }));
    expect(mv.status).toBe(200);
    const cx = await json(await handleCancelOccurrence(w.deps, target.id, "2026-11-03", { requestId: REQ(21), expectedUpdatedAt: target.updatedAt, scope: "this" }));
    expect(cx.status).toBe(200);
    expect(w.calls.get).toBe(g0);
    expect(w.calls.list).toBe(l0);
    expect(w.calls.write).toEqual([]);
    expect(mv.body.summarySync).toBeUndefined();

    const sp = await json(await handleEditOccurrence(w.deps, target.id, "2026-11-10", { requestId: REQ(22), expectedUpdatedAt: target.updatedAt, scope: "future", changes: { studentId: S2 } }));
    expect(sp.status).toBe(200);
    expect(sp.body.summarySync).toBe("synced");
    expect(w.calls.write.map((x) => x.id).sort()).toEqual([S1, S2]);
    const s1 = w.calls.write.find((x) => x.id === S1)!.text;
    expect(s1).toContain("until 2026-11-09");
  });

  it("a split to a student who is not adopted and still has legacy text is 409", async () => {
    const w = await adopted();
    w.notion.set(S3, { id: S3, name: "S3", stage: "Active", weeklySchedule: CLEAN });
    const target = [...w.series.values()].find((s) => s.studentId === S1)!;
    const r = await json(await handleEditOccurrence(w.deps, target.id, "2026-11-10", { requestId: REQ(23), expectedUpdatedAt: target.updatedAt, scope: "future", changes: { studentId: S3 } }));
    expect(r).toMatchObject({ status: 409, body: { error: "legacy_schedule_pending" } });
  });
});

describe("AC17: monthly review", () => {
  it("returns per adopted student items, flags, and a needsReview boolean", async () => {
    const w = world({ [S1]: CLEAN });
    await handleImportRun(w.deps, {});
    const target = [...w.series.values()][0];
    await handleCancelOccurrence(w.deps, target.id, "2026-11-17", { requestId: REQ(30), expectedUpdatedAt: target.updatedAt, scope: "this" });
    const r = await json(await handleMonthlyReview(w.deps, new URLSearchParams("month=2026-11")));
    expect(r.status).toBe(200);
    expect(r.body.month).toBe("2026-11");
    expect(r.body.students).toHaveLength(1);
    expect(r.body.students[0]).toMatchObject({ studentId: S1, name: "Student 11", needsReview: true });
    expect(r.body.students[0].cancelled).toHaveLength(1);
    const quiet = await json(await handleMonthlyReview(w.deps, new URLSearchParams("month=2027-03")));
    expect(quiet.body.students[0]).toMatchObject({ needsReview: false, cancelled: [], moved: [], oneOff: [], from: [], until: [] });
  });
  it("a bad month is 400", async () => {
    const w = world({});
    for (const m of ["", "2026-13", "2026-1", "nope"]) expect((await handleMonthlyReview(w.deps, new URLSearchParams(`month=${m}`))).status).toBe(400);
  });
});

describe("AC20: names appear only in admin responses and never reach Postgres", () => {
  it("the store never receives a student name", async () => {
    const w = world({ [S1]: CLEAN });
    await handleImportRun(w.deps, {});
    expect(JSON.stringify([...w.series.values(), ...w.summaries.values()])).not.toContain("Student 11");
  });
});

describe("routes and source scans (AC18, AC4, AC21)", () => {
  const root = resolve(__dirname, "../../..");
  for (const [file, exp] of [
    ["app/api/scheduler/import/route.ts", ["GET", "POST"]],
    ["app/api/scheduler/summaries/sync/route.ts", ["POST"]],
    ["app/api/scheduler/monthly-review/route.ts", ["GET"]],
  ] as const) {
    it(`${file} exports ${exp.join(", ")} and force-dynamic`, () => {
      const src = readFileSync(join(root, file), "utf8");
      for (const e of exp) expect(src).toMatch(new RegExp(`export (async function|const) ${e}\\b`));
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    });
  }
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts") ? [p] : [];
    });
  it("no scheduler code names Owner, Trial Teacher, the Lessons source or payouts", () => {
    const targets = ["lib/domain/schedule", "lib/scheduler", "lib/notion/students.ts", "app/api/scheduler", "app/scheduler", "components/scheduler"]
      .map((t) => join(root, t))
      .flatMap((t) => (statSync(t, { throwIfNoEntry: false })?.isDirectory() ? walk(t) : statSync(t, { throwIfNoEntry: false }) ? [t] : []));
    expect(targets.length).toBeGreaterThan(10);
    for (const file of targets) {
      const src = readFileSync(file, "utf8");
      // The Notion property names, case sensitive: the org role "owner" is unrelated.
      expect(src, file).not.toMatch(/\bOwner\b|Trial Teacher/);
      expect(src, file).not.toMatch(/6300f58a|payouts?\b/i);
    }
  });
  it("only billing.ts, lessons.ts, staff.ts, students.ts and work.ts call Notion; only students.ts (Weekly Schedule), work.ts (Work, Work Log) and lessons.ts (Lessons, REQ-39) write", () => {
    const hits = walk(root).filter((f) => !f.includes("/node_modules/") && !f.includes("/.next/") && readFileSync(f, "utf8").includes("api.notion.com")).map((f) => f.slice(root.length + 1)).sort();
    expect(hits).toEqual(["lib/notion/billing.ts", "lib/notion/lessons.ts", "lib/notion/staff.ts", "lib/notion/students.ts", "lib/notion/work.ts"]);
    expect(readFileSync(join(root, "lib/notion/staff.ts"), "utf8")).not.toMatch(/PATCH|PUT|DELETE/);
    expect(readFileSync(join(root, "lib/notion/billing.ts"), "utf8")).not.toMatch(/PATCH|PUT|DELETE/);
  });
  it("REQ-39 AC13: lessons.ts never deletes, puts, archives or trashes, and uses only GET, POST and PATCH", () => {
    const src = readFileSync(join(root, "lib/notion/lessons.ts"), "utf8");
    expect(src).not.toMatch(/DELETE|PUT|archived|in_trash/);
    const methods = new Set([...src.matchAll(/method: "([A-Z]+)"/g)].map((m) => m[1]));
    expect([...methods].sort()).toEqual(["GET", "PATCH", "POST"]);
    expect(src).not.toMatch(/Paid to Teacher|Pay Period|"Type"/);
  });
});

describe("REQ-35 AC15: summaries go through the outbox when it is wired in", () => {
  // The outbox with the 0021 trigger played by hand: adoption and enqueue_summary_sync add rows.
  const withOutbox = (w: ReturnType<typeof world>) => {
    const out = fakeOutbox(ORG);
    const store = new Proxy(w.store, {
      get(target, key: string) {
        const v = target[key as keyof ScheduleStore];
        if (key !== "adoptStudent" || typeof v !== "function") return v;
        return async (input: { studentId: string }) => {
          const r = await (v as (i: unknown) => Promise<StoreResult<SummaryRecord>>)(input);
          if (r.ok && r.created) out.enqueue("summary", input.studentId);
          return r;
        };
      },
    });
    return { out, deps: { ...w.deps, store, outbox: out.store, sleep: async () => {} } as ScheduleDeps };
  };
  it("the import run delivers each adopted student's summary row and records sync_state as before", async () => {
    const w = world({ [S1]: CLEAN });
    const { out, deps } = withOutbox(w);
    const r = await json(await handleImportRun(deps, { dryRun: false }));
    expect(r.body.results).toEqual([{ studentId: S1, name: "Student 11", status: "adopted", summarySync: "synced" }]);
    expect(out.rows).toMatchObject([{ kind: "summary", targetId: S1, status: "done" }]);
    expect(w.summaries.get(S1)).toMatchObject({ syncState: "synced", lastError: null });
  });
  it("Sync all calls enqueueSummaries, drains the returned rows, and keeps the response shape", async () => {
    const w = world({ [S1]: CLEAN, [S2]: CLEAN });
    const { out, deps } = withOutbox(w);
    await handleImportRun(deps, { dryRun: false });
    out.calls.length = 0;
    w.failWrites(true);
    await json(await handleSyncSummaries(deps, {}));
    // The text already matches, so no write is attempted and both are synced.
    const r = await json(await handleSyncSummaries(deps, {}));
    expect(out.calls).toContain("enqueueSummaries");
    expect(r.body.results).toEqual([{ studentId: S1, summarySync: "synced" }, { studentId: S2, summarySync: "synced" }]);
  });
  it("a failed delivery leaves sync_state failed with its short error and the row pending for a retry", async () => {
    const w = world({ [S1]: CLEAN });
    const { out, deps } = withOutbox(w);
    await handleImportRun(deps, { dryRun: false });
    w.notion.set(S1, { ...w.notion.get(S1)!, weeklySchedule: "edited by hand" });
    w.failWrites(true);
    const r = await json(await handleSyncSummaries(deps, { studentId: S1 }));
    expect(r.body.results).toEqual([{ studentId: S1, summarySync: "queued" }]);
    expect(w.summaries.get(S1)).toMatchObject({ syncState: "failed", lastError: "Notion returned 500" });
    expect(out.rows.at(-1)).toMatchObject({ status: "pending", attempts: 1 }); // a 500 is retried with backoff (AC4)
  });
});
