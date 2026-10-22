import { describe, expect, it, vi } from "vitest";
import type { Db } from "../data/client";
import { LessonLinkError } from "../domain/schedule/lesson-link";
import type { OwnerViewer } from "./guard";
import { AVAILABILITY_EXCEPTION_COLUMNS, createOperationsReader, EXCEPTION_COLUMNS, SERIES_COLUMNS, WINDOW_COLUMNS } from "./operations-read";

// REQ-58 AC5, AC6: the operations reads on the owner's client. Zod-parsed, and any query error throws.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const STAFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const STUDENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const SERIES = (n: number) => ({
  id: `c0000000-0000-4000-8000-00000000000${n}`, notion_staff_id: STAFF, notion_student_id: STUDENT, subject: "MHF4U", kind: "weekly",
  start_date: "2026-10-05", start_time: "16:00:00", duration_minutes: 60, effective_until: null, purpose: null, makeup_for: null,
});
const RANGE = { from: "2026-10-09", to: "2026-11-01" };

type Call = { table: string; ops: [string, ...unknown[]][] };
type Answer = { data: unknown; error: unknown };

function recording(answer: (call: Call) => Answer) {
  const calls: Call[] = [];
  const tracker = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "lte", "gte", "or", "in"]) {
        chain[op] = (...args: unknown[]) => {
          call.ops.push([op, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(answer(call)).then(resolve, reject);
      return chain;
    },
  } as unknown as Db["tracker"];
  const viewer = { kind: "staff", role: "owner", userId: "u1", email: "o@example.com", orgId: ORG, db: { tracker } } as unknown as OwnerViewer;
  return { viewer, calls };
}

const MOVED_IN = { id: "e0000000-0000-4000-8000-000000000001", series_id: SERIES(2).id, original_date: "2026-09-28", kind: "moved", new_date: "2026-10-20", new_start_time: "10:30:00" };
const okSchedule = (c: Call): Answer => {
  if (c.table === "class_exceptions") return { data: [MOVED_IN], error: null };
  const byId = c.ops.some(([op]) => op === "in");
  return { data: byId ? [SERIES(2)] : [SERIES(1)], error: null };
};

describe("schedule", () => {
  it("reads the org's series and exceptions in range, plus series that reach it only through a move", async () => {
    const { viewer, calls } = recording(okSchedule);
    const read = await createOperationsReader(viewer, null).schedule(RANGE);
    expect(calls.map((c) => c.table)).toEqual(["class_series", "class_exceptions", "class_series"]);
    expect(calls[0].ops).toEqual([["select", SERIES_COLUMNS], ["eq", "org_id", ORG], ["lte", "start_date", "2026-11-01"], ["or", "effective_until.is.null,effective_until.gte.2026-10-09"]]);
    expect(calls[1].ops).toEqual([
      ["select", EXCEPTION_COLUMNS], ["eq", "org_id", ORG],
      ["or", "and(original_date.gte.2026-10-09,original_date.lte.2026-11-01),and(new_date.gte.2026-10-09,new_date.lte.2026-11-01)"],
    ]);
    expect(calls[2].ops).toEqual([["select", SERIES_COLUMNS], ["eq", "org_id", ORG], ["in", "id", [SERIES(2).id]]]);
    expect(read.series.map((s) => s.id)).toEqual([SERIES(1).id, SERIES(2).id]);
    expect(read.series[0]).toMatchObject({ staffId: STAFF, studentId: STUDENT, startTime: "16:00", purpose: null, kind: "weekly" });
    expect(read.exceptions).toEqual([{ id: MOVED_IN.id, seriesId: SERIES(2).id, originalDate: "2026-09-28", kind: "moved", newDate: "2026-10-20", newStartTime: "10:30" }]);
  });

  it.each([0, 1, 2])("a query error on call %i throws", async (n) => {
    let i = 0;
    const { viewer } = recording((c) => (i++ === n ? { data: null, error: { message: "boom" } } : okSchedule(c)));
    await expect(createOperationsReader(viewer, null).schedule(RANGE)).rejects.toThrow();
  });

  it("a malformed row throws instead of being dropped", async () => {
    const { viewer } = recording((c) => (c.table === "class_series" ? { data: [{ ...SERIES(1), duration_minutes: "60" }], error: null } : { data: [], error: null }));
    await expect(createOperationsReader(viewer, null).schedule(RANGE)).rejects.toThrow();
  });
});

describe("availability", () => {
  const ok = (c: Call): Answer => (c.table === "availability_windows"
    ? { data: [{ notion_staff_id: STAFF, weekday: 1, start_time: "15:00:00", end_time: "19:00:00", effective_from: "2026-01-05", effective_until: null }], error: null }
    : { data: [{ notion_staff_id: STAFF, on_date: "2026-10-20", kind: "time_off", start_time: null, end_time: null }], error: null });

  it("groups the org's windows and in-range exceptions by staff", async () => {
    const { viewer, calls } = recording(ok);
    const read = await createOperationsReader(viewer, null).availability(RANGE);
    expect(calls[0].ops).toEqual([["select", WINDOW_COLUMNS], ["eq", "org_id", ORG]]);
    expect(calls[1].ops).toEqual([["select", AVAILABILITY_EXCEPTION_COLUMNS], ["eq", "org_id", ORG], ["gte", "on_date", "2026-10-09"], ["lte", "on_date", "2026-11-01"]]);
    expect(read).toEqual([{
      staffId: STAFF,
      windows: [{ weekday: 1, startTime: "15:00", endTime: "19:00", effectiveFrom: "2026-01-05", effectiveUntil: null }],
      exceptions: [{ onDate: "2026-10-20", kind: "time_off", startTime: null, endTime: null }],
    }]);
  });

  it.each(["availability_windows", "availability_exceptions"])("an error on %s throws", async (table) => {
    const { viewer } = recording((c) => (c.table === table ? { data: null, error: { message: "boom" } } : ok(c)));
    await expect(createOperationsReader(viewer, null).availability(RANGE)).rejects.toThrow();
  });
});

describe("outcomes", () => {
  const key = { seriesId: SERIES(1).id, originalDate: "2026-10-19" };
  const row = { id: "f0000000-0000-4000-8000-000000000001", series_id: key.seriesId, original_date: key.originalDate, outcome: "delivered", link_source: "logged", notion_lesson_id: null, lesson_date: null, claimed_at: null };

  it("reads through the outcome store and keeps only what the aggregation needs", async () => {
    const { viewer, calls } = recording(() => ({ data: [row], error: null }));
    expect(await createOperationsReader(viewer, null).outcomes([key])).toEqual([{ ...key, outcome: "delivered", notionLessonId: null }]);
    expect(calls[0].table).toBe("occurrence_outcomes");
  });

  it("a query error throws", async () => {
    const { viewer } = recording(() => ({ data: null, error: { message: "boom" } }));
    await expect(createOperationsReader(viewer, null).outcomes([key])).rejects.toThrow();
  });
});

describe("unlinkedLessons", () => {
  const signal = new AbortController().signal;
  const { viewer } = recording(() => ({ data: [], error: null }));

  it("is not_configured with no port", async () => {
    expect(await createOperationsReader(viewer, null).unlinkedLessons(RANGE, signal)).toEqual({ ok: false, code: "not_configured" });
  });

  it("passes the range and the abort signal to the port", async () => {
    const port = vi.fn(async () => [{ id: "x", date: "2026-10-20", staffIds: [], studentIds: [], ref: "" }]);
    expect(await createOperationsReader(viewer, port).unlinkedLessons(RANGE, signal)).toEqual({ ok: true, rows: [{ id: "x", date: "2026-10-20", staffIds: [], studentIds: [], ref: "" }] });
    expect(port).toHaveBeenCalledWith(RANGE, signal);
  });

  it("maps lessons_not_ready by code and any other error to failed", async () => {
    const notReady = async () => { throw new LessonLinkError("lessons_not_ready"); };
    const other = async () => { throw new Error("Notion returned 500"); };
    expect(await createOperationsReader(viewer, notReady).unlinkedLessons(RANGE, signal)).toEqual({ ok: false, code: "lessons_not_ready" });
    expect(await createOperationsReader(viewer, other).unlinkedLessons(RANGE, signal)).toEqual({ ok: false, code: "failed" });
  });
});
