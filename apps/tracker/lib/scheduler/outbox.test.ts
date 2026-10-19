import { describe, expect, it } from "vitest";
import { NotionError } from "../notion/staff";
import type { StudentRecord } from "../notion/students";
import type { DailyTaskDeps } from "./daily-task";
import type { DailyTaskRow, DailyTaskStore } from "./daily-task-store";
import { drainOutbox, MAX_ATTEMPTS, nextAttemptAt, SPACING_MS, type DrainDeps } from "./outbox";
import { fakeOutbox } from "./outbox.fake";
import type { ScheduleStore, SeriesRecord, SummaryPatch, SummaryRecord } from "./schedule-store";
import { isAmbiguous, isRetryable } from "./notion-errors";
import { RenderError } from "./summary-sync";

const ORG = "10000000-0000-4000-8000-000000000001";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TODAY = "2026-10-19";
const T0 = Date.parse("2026-10-19T14:00:00Z");

const series = (studentId: string): SeriesRecord => ({
  id: `50000000-0000-4000-8000-${studentId.slice(0, 12)}`, staffId: T1, studentId, subject: "MHF4U", kind: "weekly", startDate: "2026-10-19",
  startTime: "16:00", durationMinutes: 60, effectiveUntil: null, splitFrom: null, updatedAt: "t",
});
const summary = (studentId: string): SummaryRecord => ({
  id: `s-${studentId}`, studentId, adoptedAt: TODAY, adoptedFromText: "", lastWrittenText: "", lastWrittenAt: null, syncState: "synced", lastError: null, lastDriftText: null,
});

/** A clock that only moves when the drain sleeps or a test advances it. */
function harness(opts: { daily?: Partial<DailyTaskDeps> } = {}) {
  let now = T0;
  const out = fakeOutbox(ORG, () => now);
  const notion = new Map<string, string>([[S1, ""], [S2, ""]]);
  const writes: string[] = [];
  const marks: SummaryPatch[] = [];
  /** Each entry is consumed by one Notion write: "ok", an error to throw, or "commit-then-throw". */
  const plan: (string | Error | { commitThen: Error })[] = [];
  const sleeps: number[] = [];
  const store = {
    getSummary: async (id: string) => summary(id),
    listSeriesForStudent: async (id: string) => ({ series: [series(id)], exceptions: [] }),
    markSummary: async (_id: string, p: SummaryPatch) => { marks.push(p); return true; },
  } as unknown as ScheduleStore;
  const deps: DrainDeps = {
    outbox: out.store,
    summary: {
      store, today: () => TODAY,
      fetchStaff: async () => [{ id: T1, name: "Ryan", email: null, functions: ["Teacher"], status: "Active", subjects: [] }],
      students: {
        list: async () => [],
        get: async (id): Promise<StudentRecord | null> => ({ id, name: "x", stage: "Active", weeklySchedule: notion.get(id) ?? "" }),
        write: async (id, text) => {
          const step = plan.shift() ?? "ok";
          if (step instanceof Error) throw step;
          writes.push(id);
          notion.set(id, text);
          if (typeof step === "object") throw step.commitThen;
        },
      },
    },
    dailyTask: opts.daily as DailyTaskDeps | undefined,
    today: () => TODAY,
    now: () => new Date(now),
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
  };
  return { out, deps, writes, marks, plan, sleeps, notion, advance: (ms: number) => { now += ms; }, get now() { return now; } };
}

describe("nextAttemptAt and error classes (AC4)", () => {
  it("30 s, 60 s, 120 s and so on, capped at 1 h", () => {
    const at = (n: number) => (Date.parse(nextAttemptAt(n, new Date(T0))) - T0) / 1000;
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(at)).toEqual([30, 60, 120, 240, 480, 960, 1920, 3600, 3600]);
  });
  it("Retry-After wins when it is longer", () => {
    expect((Date.parse(nextAttemptAt(1, new Date(T0), 120)) - T0) / 1000).toBe(120);
    expect((Date.parse(nextAttemptAt(3, new Date(T0), 5)) - T0) / 1000).toBe(120);
  });
  it("429, 5xx, no status and non-Notion errors are retryable; 400, 401, 403, 404 and render errors are not", () => {
    for (const s of [429, 500, 502, 503, 504, undefined]) expect(isRetryable(new NotionError("x", s))).toBe(true);
    for (const s of [400, 401, 403, 404]) expect(isRetryable(new NotionError("x", s))).toBe(false);
    expect(isRetryable(new Error("db down"))).toBe(true);
    expect(isRetryable(new RenderError())).toBe(false);
    expect(isAmbiguous(new Error("db down"))).toBe(false);
    expect(isAmbiguous(new NotionError("x", 429))).toBe(false);
    expect(isAmbiguous(new NotionError("x", 504))).toBe(true);
    expect(isAmbiguous(new NotionError("x"))).toBe(true);
  });
});

describe("drainOutbox: summaries", () => {
  it("AC6: a 500 then a success writes the text once and ends done", async () => {
    const h = harness();
    const id = h.out.enqueue("summary", S1);
    h.plan.push(new NotionError("Notion returned 500", 500));
    expect(await drainOutbox(h.deps)).toEqual([{ id, kind: "summary", targetId: S1, status: "pending", result: "failed" }]);
    expect(h.out.row(id)).toMatchObject({ status: "pending", attempts: 1, lastError: "Notion returned 500" });
    expect(Date.parse(h.out.row(id)!.nextAttemptAt) - h.now).toBe(30_000);
    expect(await drainOutbox(h.deps)).toEqual([]); // not due yet
    h.advance(30_000);
    expect((await drainOutbox(h.deps))[0]).toMatchObject({ status: "done", result: "synced" });
    expect(h.writes).toEqual([S1]);
    expect(h.out.row(id)).toMatchObject({ status: "done", lastError: null, payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });
  it("AC6: a write that commits then times out ends pending, and the next drain reads equal text and writes nothing", async () => {
    const h = harness();
    const id = h.out.enqueue("summary", S1);
    h.plan.push({ commitThen: new NotionError("Notion request failed") });
    expect((await drainOutbox(h.deps))[0].status).toBe("pending");
    h.advance(30_000);
    expect((await drainOutbox(h.deps))[0]).toMatchObject({ id, status: "done" });
    expect(h.writes).toEqual([S1]);
  });
  it("AC4: a 404 is failed at once; a retryable failure on attempt 8 is failed", async () => {
    const h = harness();
    const a = h.out.enqueue("summary", S1);
    h.plan.push(new NotionError("Notion returned 404", 404));
    await drainOutbox(h.deps);
    expect(h.out.row(a)).toMatchObject({ status: "failed", lastError: "Notion returned 404" });
    const b = h.out.enqueue("summary", S2);
    h.out.row(b)!.attempts = MAX_ATTEMPTS - 1;
    h.plan.push(new NotionError("Notion returned 503", 503));
    await drainOutbox(h.deps);
    expect(h.out.row(b)).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
  });
  it("AC4: a store error reading the summary row is retried, not failed", async () => {
    const h = harness();
    const id = h.out.enqueue("summary", S1);
    const getSummary = h.deps.summary!.store.getSummary;
    h.deps.summary!.store.getSummary = async () => { throw new Error("db down"); };
    expect(await drainOutbox(h.deps)).toMatchObject([{ id, status: "pending", result: "failed" }]);
    expect(h.out.row(id)).toMatchObject({ status: "pending", attempts: 1, lastError: "The Weekly Schedule could not be sent" });
    h.deps.summary!.store.getSummary = getSummary;
    h.advance(30_000);
    expect((await drainOutbox(h.deps))[0]).toMatchObject({ id, status: "done" });
  });
  it("a delivery that throws (markSummary rejects after the write) never escapes the drain, and the row is retried", async () => {
    const h = harness();
    const id = h.out.enqueue("summary", S1);
    const store = h.deps.summary!.store;
    const markSummary = store.markSummary;
    store.markSummary = async () => { throw new Error("db down"); };
    expect(await drainOutbox(h.deps, { ids: [id] })).toMatchObject([{ id, status: "pending", result: "failed" }]);
    expect(h.out.row(id)).toMatchObject({ status: "pending", attempts: 1 });
    store.markSummary = markSummary;
    h.advance(30_000);
    expect((await drainOutbox(h.deps))[0]).toMatchObject({ id, status: "done" });
    expect(h.writes).toEqual([S1]); // the retry read equal text and wrote nothing
  });
  it("AC4: a render problem is not retried", async () => {
    const h = harness();
    const id = h.out.enqueue("summary", S1);
    h.deps.summary!.fetchStaff = async () => [];
    await drainOutbox(h.deps);
    expect(h.out.row(id)).toMatchObject({ status: "failed", lastError: "The Weekly Schedule could not be sent" });
    expect(h.marks.at(-1)).toMatchObject({ syncState: "failed", lastError: "A teacher on this schedule is not in Staff" });
  });
  it("AC3: a done delivery supersedes the older failed row for the same target only", async () => {
    const h = harness();
    const old1 = h.out.enqueue("summary", S1);
    const old2 = h.out.enqueue("summary", S2);
    h.out.row(old1)!.status = "failed";
    h.out.row(old2)!.status = "failed";
    const next = h.out.enqueue("summary", S1);
    await drainOutbox(h.deps, { ids: [next] });
    expect(h.out.row(next)!.status).toBe("done");
    expect(h.out.row(old1)).toMatchObject({ status: "superseded", supersededBy: next });
    expect(h.out.row(old2)!.status).toBe("failed");
  });
  it("AC9: a row left pending by a save whose function died is delivered by the next drain without ids", async () => {
    const h = harness();
    const id = h.out.enqueue("summary", S1);
    expect(await drainOutbox(h.deps)).toMatchObject([{ id, status: "done" }]);
  });
  it("without the Students database wired in, a summary row is closed with nothing sent", async () => {
    const h = harness();
    const id = h.out.enqueue("summary", S1);
    h.deps.summary = undefined;
    expect(await drainOutbox(h.deps)).toMatchObject([{ id, status: "done", result: "not_configured" }]);
  });
});

describe("drainOutbox: limits (AC5)", () => {
  const many = (h: ReturnType<typeof harness>, n: number) => {
    for (let i = 0; i < n; i++) h.out.enqueue("summary", `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`);
  };
  it("stops after 10 rows, with deliveries at least 350 ms apart", async () => {
    const h = harness();
    many(h, 12);
    const done = await drainOutbox(h.deps);
    expect(done).toHaveLength(10);
    expect(h.sleeps).toEqual(Array(9).fill(SPACING_MS));
  });
  it("stops after 20 s", async () => {
    const h = harness();
    many(h, 12);
    h.deps.summary!.students.get = async (id) => { h.advance(4_000); return { id, name: "x", stage: "Active", weeklySchedule: "" }; };
    const done = await drainOutbox(h.deps);
    expect(done.length).toBeLessThan(10);
    expect(done.length).toBe(5);
  });
  it("stops at the first 429 and keeps Retry-After", async () => {
    const h = harness();
    const a = h.out.enqueue("summary", S1);
    h.out.enqueue("summary", S2);
    h.plan.push(new NotionError("Notion returned 429", 429, 90));
    expect(await drainOutbox(h.deps)).toHaveLength(1);
    expect(Date.parse(h.out.row(a)!.nextAttemptAt) - h.now).toBe(90_000);
  });
});

describe("drainOutbox: today's task", () => {
  const row: DailyTaskRow = { id: "t", localDate: TODAY, notionPageId: "p", notionPageUrl: "u", notionLogId: "l", state: "ready", lastError: null, refreshCount: 0, updatedAt: "" };
  const daily = (store: Partial<DailyTaskStore>, notion: Partial<DailyTaskDeps["notion"]> = {}): Partial<DailyTaskDeps> => ({
    store: { get: async () => row, claim: async () => row, save: async () => {}, listTeachers: async () => [], saveTeacher: async () => {}, ...store },
    notion: { list: async () => ({ introId: null, todos: [] }), ...notion } as DailyTaskDeps["notion"],
    fetchStaff: async () => [], studentNames: async () => new Map(), occurrencesOn: async () => [], scheduleUrl: () => "", now: () => new Date(T0), sessionLink: "",
  });
  it("AC4: a busy daily task reschedules 30 s later without counting an attempt", async () => {
    const h = harness({ daily: daily({ claim: async () => null }) });
    const id = h.out.enqueue("daily_task", ORG);
    expect(await drainOutbox(h.deps)).toMatchObject([{ id, status: "pending", result: "busy" }]);
    expect(h.out.row(id)).toMatchObject({ status: "pending", attempts: 0 });
    expect(Date.parse(h.out.row(id)!.nextAttemptAt) - h.now).toBe(30_000);
  });
  it("AC7: an uncertain daily task is set uncertain and never claimed again", async () => {
    const h = harness({
      daily: daily(
        { listTeachers: async () => [] },
        { append: async () => { throw new NotionError("Notion returned 504", 504); }, list: async () => ({ introId: null, todos: [] }) },
      ),
    });
    h.deps.dailyTask!.fetchStaff = async () => [{ id: T1, name: "Ryan", email: null, functions: ["Teacher"], status: "Active", subjects: [] }];
    const id = h.out.enqueue("daily_task", ORG);
    expect(await drainOutbox(h.deps)).toMatchObject([{ id, status: "uncertain", result: "uncertain" }]);
    h.advance(3_600_000);
    expect(await drainOutbox(h.deps)).toEqual([]);
  });
  it("AC7: a running daily-task row whose lease expired becomes uncertain, never re-run", async () => {
    const h = harness({ daily: daily({}) });
    const id = h.out.enqueue("daily_task", ORG);
    await h.out.store.claim([id], 1, 60);
    h.advance(61_000);
    expect(await drainOutbox(h.deps)).toEqual([]);
    expect(h.out.row(id)!.status).toBe("uncertain");
  });
  it("a refresh with nothing to change is done", async () => {
    const h = harness({ daily: daily({}) });
    const id = h.out.enqueue("daily_task", ORG);
    expect(await drainOutbox(h.deps)).toMatchObject([{ id, status: "done", result: "unchanged" }]);
  });
});

describe("drainOutbox: a newer change while delivering", () => {
  it("a retryable failure while a newer row is pending hands over to it instead of a second pending row", async () => {
    const h = harness();
    const first = h.out.enqueue("summary", S1);
    let second = "";
    h.deps.summary!.students.write = async () => {
      second = h.out.enqueue("summary", S1); // a save lands while this delivery is in flight
      throw new NotionError("Notion returned 503", 503);
    };
    await drainOutbox(h.deps, { ids: [first] });
    expect(h.out.row(first)).toMatchObject({ status: "superseded", supersededBy: second });
    expect(h.out.rows.filter((r) => r.status === "pending").map((r) => r.id)).toEqual([second]);
  });
});
