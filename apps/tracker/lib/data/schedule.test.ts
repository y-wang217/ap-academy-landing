import { describe, expect, it } from "vitest";
import type { Db } from "./client";
import { createScheduleStore } from "./schedule";

/** A Supabase-like query chain whose every call returns the given result when awaited. */
function chain(result: { data: unknown; error: unknown }) {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}
const store = (result: { data: unknown; error: unknown }) =>
  createScheduleStore(async () => ({
    db: { tracker: { from: () => chain(result), rpc: () => chain(result) } } as unknown as Db,
    orgId: "10000000-0000-4000-8000-000000000001",
    userId: "20000000-0000-4000-8000-000000000001",
  }));
const FAIL = { data: null, error: { message: "boom" } };

describe("review: a failed read is never an empty answer", () => {
  it("listSeriesForStudent, getSummary and listSummaries throw on a query error", async () => {
    const s = store(FAIL);
    await expect(s.listSeriesForStudent("11111111-1111-4111-8111-111111111111")).rejects.toThrow("unavailable");
    await expect(s.getSummary("11111111-1111-4111-8111-111111111111")).rejects.toThrow("unavailable");
    await expect(s.listSummaries()).rejects.toThrow("unavailable");
  });
  it("a successful empty read is still empty", async () => {
    const s = store({ data: [], error: null });
    expect(await s.listSeriesForStudent("11111111-1111-4111-8111-111111111111")).toEqual({ series: [], exceptions: [] });
    expect(await s.listSummaries()).toEqual([]);
    expect(await store({ data: null, error: null }).getSummary("11111111-1111-4111-8111-111111111111")).toBeNull();
  });
});
