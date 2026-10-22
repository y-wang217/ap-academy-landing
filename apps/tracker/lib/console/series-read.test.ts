import { describe, expect, it } from "vitest";
import type { Db } from "../data/client";
import { createConsoleSeriesReader, SERIES_COLUMNS } from "./series-read";

// REQ-56 AC8: the org-wide series read on the owner's client. Three queries, Zod-parsed, and any error throws,
// so a failed read never looks like "no classes".
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const ROW = {
  id: "c0000000-0000-4000-8000-000000000001", notion_student_id: "a0000000-0000-4000-8000-000000000001", notion_staff_id: "b0000000-0000-4000-8000-000000000001",
  kind: "weekly", purpose: null, start_date: "2026-10-21", effective_until: null, duration_minutes: 60, split_from: null, created_at: "2026-10-21T15:00:00+00:00",
};
const ADOPTION = { notion_student_id: ROW.notion_student_id, adopted_at: "2026-09-01T10:00:00+00:00" };

type Call = { table: string; ops: [string, ...unknown[]][] };
type Answer = { data: unknown; error: unknown };

function recording(answer: (call: Call) => Answer) {
  const calls: Call[] = [];
  const tracker = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "lte", "gte", "or"]) {
        chain[op] = (...args: unknown[]) => {
          call.ops.push([op, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(answer(call)).then(resolve, reject);
      return chain;
    },
  } as unknown as Db["tracker"];
  return { tracker, calls };
}

const isOneOff = (c: Call) => c.ops.some(([op, col, v]) => op === "eq" && col === "kind" && v === "one_off");
const ok = (c: Call): Answer => (c.table === "schedule_summaries" ? { data: [ADOPTION], error: null } : { data: isOneOff(c) ? [] : [ROW], error: null });

describe("createConsoleSeriesReader", () => {
  it("runs the weekly, one-off and adoption queries with the window's filters", async () => {
    const { tracker, calls } = recording(ok);
    await createConsoleSeriesReader(tracker, ORG)({ from: "2026-10-12", to: "2026-10-25" });
    expect(calls.map((c) => c.table).sort()).toEqual(["class_series", "class_series", "schedule_summaries"]);
    const [weekly, oneOff] = [calls.find((c) => c.table === "class_series" && !isOneOff(c))!, calls.find(isOneOff)!];
    expect(weekly.ops).toEqual([
      ["select", SERIES_COLUMNS], ["eq", "org_id", ORG], ["eq", "kind", "weekly"], ["lte", "start_date", "2026-10-25"],
      ["or", "effective_until.is.null,effective_until.gte.2026-10-11"],
    ]);
    expect(oneOff.ops).toEqual([["select", SERIES_COLUMNS], ["eq", "org_id", ORG], ["eq", "kind", "one_off"], ["gte", "start_date", "2026-10-12"], ["lte", "start_date", "2026-10-25"]]);
    expect(calls.find((c) => c.table === "schedule_summaries")!.ops).toEqual([["select", "notion_student_id, adopted_at"], ["eq", "org_id", ORG]]);
    expect(SERIES_COLUMNS).toBe("id, notion_student_id, notion_staff_id, kind, purpose, start_date, effective_until, duration_minutes, split_from, created_at");
  });

  it("parses rows to series facts and adoptions", async () => {
    const { tracker } = recording(ok);
    const read = await createConsoleSeriesReader(tracker, ORG)({ from: "2026-10-12", to: "2026-10-25" });
    expect(read.series).toEqual([{
      id: ROW.id, studentId: ROW.notion_student_id, staffId: ROW.notion_staff_id, kind: "weekly", purpose: null, startDate: "2026-10-21",
      effectiveUntil: null, durationMinutes: 60, splitFrom: null, createdAt: ROW.created_at,
    }]);
    expect(read.adoptions).toEqual([{ studentId: ADOPTION.notion_student_id, adoptedAt: ADOPTION.adopted_at }]);
  });

  it.each([["weekly"], ["one_off"], ["schedule_summaries"]])("a query error on %s throws", async (which) => {
    const { tracker } = recording((c) => {
      const hit = which === "schedule_summaries" ? c.table === which : c.table === "class_series" && (which === "one_off") === isOneOff(c);
      return hit ? { data: null, error: { message: "boom" } } : ok(c);
    });
    await expect(createConsoleSeriesReader(tracker, ORG)({ from: "2026-10-12", to: "2026-10-25" })).rejects.toThrow();
  });

  it("a malformed row throws instead of being dropped", async () => {
    const { tracker } = recording((c) => (c.table === "class_series" && !isOneOff(c) ? { data: [{ ...ROW, duration_minutes: "60" }], error: null } : ok(c)));
    await expect(createConsoleSeriesReader(tracker, ORG)({ from: "2026-10-12", to: "2026-10-25" })).rejects.toThrow();
  });
});
