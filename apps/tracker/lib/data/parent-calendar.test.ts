import { describe, expect, it } from "vitest";
import type { Db } from "./client";
import { loadChildCalendar, teacherNames } from "./parent-calendar";

const NOTION = "dddddddd-dddd-4ddd-8ddd-dddddddd0001";
const CHILD = { id: "11111111-1111-4111-8111-111111111111" };
const ROW = { notion_student_id: NOTION, first_name: "Ada", last_initial: "P", grade_level: 11 };

/** The one chain the loader uses: from("students").select(...).eq("id", ...).maybeSingle(). */
function fakeDb(result: { data: unknown; error: unknown }): { db: Db; asked: string[] } {
  const asked: string[] = [];
  const chain = {
    select: (cols: string) => { asked.push(cols); return chain; },
    eq: (col: string, val: string) => { asked.push(`${col}=${val}`); return chain; },
    maybeSingle: async () => result,
  };
  const db = { tracker: { from: (t: string) => { asked.push(t); return chain; } } } as unknown as Db;
  return { db, asked };
}
const series = [{
  id: "s1", staffId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", studentId: NOTION, subject: "MHF4U", kind: "weekly" as const,
  startDate: "2026-09-01", startTime: "17:30", durationMinutes: 60, effectiveUntil: null, updatedAt: "x", splitFrom: null,
}];
const exceptions = [{ seriesId: "s1", originalDate: "2026-10-06", kind: "cancelled" as const, newDate: null, newStartTime: null }];

describe("loadChildCalendar (AC10, AC12)", () => {
  it("a null notion_student_id is not available, and the store is never asked", async () => {
    const { db } = fakeDb({ data: { ...ROW, notion_student_id: null }, error: null });
    let called = false;
    const out = await loadChildCalendar({ db }, CHILD, { listSeriesForStudent: async () => { called = true; return { series, exceptions }; } });
    expect(out).toEqual({ kind: "not_available" });
    expect(called).toBe(false);
  });
  it("zero series is not available", async () => {
    const { db } = fakeDb({ data: ROW, error: null });
    expect(await loadChildCalendar({ db }, CHILD, { listSeriesForStudent: async () => ({ series: [], exceptions: [] }) })).toEqual({ kind: "not_available" });
  });
  it("a store throw is an error, never an empty month", async () => {
    const { db } = fakeDb({ data: ROW, error: null });
    expect(await loadChildCalendar({ db }, CHILD, { listSeriesForStudent: async () => { throw new Error("unavailable"); } })).toEqual({ kind: "error" });
  });
  it("a failed students read is an error", async () => {
    const { db } = fakeDb({ data: null, error: { message: "denied" } });
    expect(await loadChildCalendar({ db }, CHILD, { listSeriesForStudent: async () => ({ series, exceptions }) })).toEqual({ kind: "error" });
  });
  it("series and exceptions pass through with the child header", async () => {
    const { db, asked } = fakeDb({ data: ROW, error: null });
    let askedFor = "";
    const out = await loadChildCalendar({ db }, CHILD, { listSeriesForStudent: async (id) => { askedFor = id; return { series, exceptions }; } });
    expect(askedFor).toBe(NOTION);
    expect(out).toEqual({ kind: "ok", series, exceptions, header: { firstName: "Ada", lastInitial: "P", gradeLevel: 11 } });
    expect(asked).toEqual(["students", "notion_student_id, first_name, last_initial, grade_level", `id=${CHILD.id}`]);
  });
});

describe("teacherNames (AC11)", () => {
  const RYAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
  const KUBY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
  it("holds only the staff it was given, as first names", async () => {
    const out = await teacherNames([RYAN], async () => [{ id: RYAN, name: "Ryan Test" }, { id: KUBY, name: "Kuby Test" }]);
    expect(out).toEqual({ names: { [RYAN]: "Ryan" }, failed: false });
    expect(JSON.stringify(out)).not.toContain("Kuby");
  });
  it("a throwing loader gives failed and no names", async () => {
    expect(await teacherNames([RYAN], async () => { throw new Error("down"); })).toEqual({ names: {}, failed: true });
  });
  it("an ID missing from the list is absent", async () => {
    expect(await teacherNames([RYAN, KUBY], async () => [{ id: RYAN, name: "Ryan Test" }])).toEqual({ names: { [RYAN]: "Ryan" }, failed: false });
  });
});
