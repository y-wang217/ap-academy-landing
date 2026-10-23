import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Db } from "./client";
import { createIrisScheduleReader } from "./iris-schedule";

// REQ-46 AC10, AC11: the poll run's read of one student's classes, select-only.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const STUDENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005";
const SERIES = {
  id: "50000000-0000-4000-8000-000000000001", org_id: ORG, notion_staff_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0009",
  notion_student_id: STUDENT, subject: "MPM2D", kind: "weekly", start_date: "2026-10-06", start_time: "17:00:00",
  duration_minutes: 60, effective_until: null, split_from: null, updated_at: "2026-10-16T12:00:00.123456+00:00", purpose: null, makeup_for: null,
};
const EXCEPTION = { id: "60000000-0000-4000-8000-000000000001", series_id: SERIES.id, original_date: "2026-10-20", kind: "moved", new_date: "2026-10-22", new_start_time: "16:00:00" };

type Call = { table: string; ops: [string, unknown[]][] };
/** A recording Supabase-like client: each from() records its chain and resolves to the table's answer. */
function client(answers: Record<string, { data: unknown; error: unknown }>) {
  const calls: Call[] = [];
  const tracker = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in"]) q[op] = (...args: unknown[]) => (call.ops.push([op, args]), q);
      q.then = (resolve: (v: unknown) => void) => resolve(answers[table] ?? { data: [], error: null });
      return q;
    },
  };
  return { calls, tracker: tracker as unknown as Db["tracker"] };
}

describe("createIrisScheduleReader", () => {
  it("reads the student's series and their exceptions, both filtered by org", async () => {
    const c = client({ class_series: { data: [SERIES], error: null }, class_exceptions: { data: [EXCEPTION], error: null } });
    const r = await createIrisScheduleReader(c.tracker, ORG).forStudent(STUDENT);
    expect(c.calls.map((x) => x.table)).toEqual(["class_series", "class_exceptions"]);
    expect(c.calls[0].ops).toContainEqual(["eq", ["org_id", ORG]]);
    expect(c.calls[0].ops).toContainEqual(["eq", ["notion_student_id", STUDENT]]);
    expect(c.calls[1].ops).toContainEqual(["eq", ["org_id", ORG]]);
    expect(c.calls[1].ops).toContainEqual(["in", ["series_id", [SERIES.id]]]);
    expect(r.series).toEqual([expect.objectContaining({ id: SERIES.id, studentId: STUDENT, kind: "weekly", startDate: "2026-10-06", startTime: "17:00", durationMinutes: 60, effectiveUntil: null })]);
    expect(r.exceptions).toEqual([{ id: EXCEPTION.id, seriesId: SERIES.id, originalDate: "2026-10-20", kind: "moved", newDate: "2026-10-22", newStartTime: "16:00" }]);
  });

  it("asks for no exceptions when the student has no series", async () => {
    const c = client({ class_series: { data: [], error: null } });
    expect(await createIrisScheduleReader(c.tracker, ORG).forStudent(STUDENT)).toEqual({ series: [], exceptions: [] });
    expect(c.calls.map((x) => x.table)).toEqual(["class_series"]);
  });

  it("throws on a query error, so a failed read never looks like no classes", async () => {
    const fail = { data: null, error: { message: "boom" } };
    await expect(createIrisScheduleReader(client({ class_series: fail }).tracker, ORG).forStudent(STUDENT)).rejects.toThrow();
    const c = client({ class_series: { data: [SERIES], error: null }, class_exceptions: fail });
    await expect(createIrisScheduleReader(c.tracker, ORG).forStudent(STUDENT)).rejects.toThrow();
  });

  // REQ-47 AC7, AC8: one teacher's whole calendar, select only, no date filter.
  const STAFF = SERIES.notion_staff_id;
  const WINDOW = { id: "70000000-0000-4000-8000-000000000001", org_id: ORG, notion_staff_id: STAFF, weekday: 3, start_time: "15:00:00", end_time: "19:00:00", effective_from: "2026-10-01", effective_until: null, updated_at: "2026-10-16T12:00:00Z" };
  const TIME_OFF = { id: "80000000-0000-4000-8000-000000000001", org_id: ORG, notion_staff_id: STAFF, on_date: "2027-10-21", kind: "time_off", start_time: null, end_time: null, updated_at: "2026-10-16T12:00:00Z" };
  const teacherAnswers = () => ({
    class_series: { data: [SERIES], error: null }, class_exceptions: { data: [EXCEPTION], error: null },
    availability_windows: { data: [WINDOW], error: null }, availability_exceptions: { data: [TIME_OFF], error: null },
  });

  it("forTeacher reads series, exceptions, windows and every availability exception, filtered by org and staff only", async () => {
    const c = client(teacherAnswers());
    const r = await createIrisScheduleReader(c.tracker, ORG).forTeacher(STAFF);
    expect(c.calls.map((x) => x.table).sort()).toEqual(["availability_exceptions", "availability_windows", "class_exceptions", "class_series"]);
    for (const call of c.calls) {
      expect(call.ops, call.table).toContainEqual(["eq", ["org_id", ORG]]);
      expect(call.ops.map(([op]) => op).every((op) => ["select", "eq", "in"].includes(op)), call.table).toBe(true);
      if (call.table !== "class_exceptions") expect(call.ops, call.table).toContainEqual(["eq", ["notion_staff_id", STAFF]]);
    }
    expect(r.series.map((x) => x.id)).toEqual([SERIES.id]);
    expect(r.exceptions.map((x) => x.id)).toEqual([EXCEPTION.id]);
    expect(r.windows).toEqual([expect.objectContaining({ weekday: 3, startTime: "15:00", endTime: "19:00", effectiveFrom: "2026-10-01", effectiveUntil: null })]);
    expect(r.availabilityExceptions).toEqual([expect.objectContaining({ onDate: "2027-10-21", kind: "time_off", startTime: null, endTime: null })]);
  });

  it("forTeacher throws on any query error", async () => {
    for (const table of ["class_series", "class_exceptions", "availability_windows", "availability_exceptions"]) {
      const c = client({ ...teacherAnswers(), [table]: { data: null, error: { message: "boom" } } });
      await expect(createIrisScheduleReader(c.tracker, ORG).forTeacher(STAFF), table).rejects.toThrow("schedule unavailable");
    }
  });

  it("contains no write and no rpc call", () => {
    const src = readFileSync(join(__dirname, "iris-schedule.ts"), "utf8");
    for (const w of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) expect(src, w).not.toContain(w);
  });
});
