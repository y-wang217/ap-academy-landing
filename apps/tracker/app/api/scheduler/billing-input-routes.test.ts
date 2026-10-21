import { describe, expect, it } from "vitest";
import { handleMonthlyBillingInput, loadBillingMonth } from "../../../lib/scheduler/billing-handlers";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import type { ScheduleDeps } from "../../../lib/scheduler/schedule-handlers";
import { BillingInputResponse } from "../../../lib/scheduler/schemas";
import { admin, fixture, RYAN, S1, S2, teacher } from "./booking-world.fake";
import { memoryOutcomes } from "./lesson-world.fake";

// REQ-40 AC4, AC5: GET /api/scheduler/monthly-billing-input. Today is Mon 2026-10-19;
// S1 has Ryan's weekly Monday 16:00 from 10-19, S2 Kuby's weekly Wednesday 17:00 from 10-21.
async function setup() {
  const f = await fixture();
  const now = Date.parse("2026-10-27T12:00:00Z");
  const outcomes = memoryOutcomes(() => now);
  const deps = (identity: SchedulerIdentity = admin): ScheduleDeps => ({ ...f.deps(identity), outcomes: outcomes.store, now: () => now });
  f.begin();
  return { ...f, outcomes, deps };
}
const q = (s: string) => new URLSearchParams(s);
const read = async (r: Response) => ({ status: r.status, body: await r.json(), cache: r.headers.get("cache-control") });

describe("GET /monthly-billing-input (AC4)", () => {
  it("the owner gets every class of the month for each adopted student, under the strict schema", async () => {
    const w = await setup();
    await w.outcomes.store.claim({ seriesId: w.s1.id, originalDate: "2026-10-19", linkSource: "logged" });
    const r = await read(await handleMonthlyBillingInput(w.deps(), q("month=2026-10")));
    expect(r.status).toBe(200);
    expect(r.cache).toBe("no-store");
    const body = BillingInputResponse.parse(r.body);
    expect(body).toMatchObject({ schemaVersion: 1, rulesVersion: 1, month: "2026-10", asOf: "2026-10-27T12:00:00.000Z" });
    expect(body.students.map((s) => s.studentId)).toEqual([S1, S2]);
    const s1 = body.students[0];
    expect(s1.sync).toEqual({ state: "synced", stale: true });
    expect(s1.occurrences.map((o) => [o.date, o.teacherId, o.outcome, o.chargeState, o.unconfirmed])).toEqual([
      ["2026-10-19", RYAN, "delivered", "chargeable", true],
      ["2026-10-26", RYAN, "none", "chargeable", true],
    ]);
    expect(body.students[1].occurrences.map((o) => [o.date, o.chargeState])).toEqual([["2026-10-21", "chargeable"], ["2026-10-28", "not_charged"]]);
  });

  it("reads outcomes for a makeup in another month, and writes nothing", async () => {
    const w = await setup();
    w.exceptions.push({ id: "60000000-0000-4000-8000-000000000001", seriesId: w.s1.id, originalDate: "2026-10-26", kind: "cancelled", newDate: null, newStartTime: null, requestId: "r" });
    const m = await w.seed({ kind: "one_off", startDate: "2026-11-02", startTime: "18:00", purpose: "makeup", makeupFor: "60000000-0000-4000-8000-000000000001" });
    await w.outcomes.store.claim({ seriesId: m.id, originalDate: "2026-11-02", linkSource: "logged" });
    w.begin();
    w.outcomes.calls.length = 0;
    const r = await read(await handleMonthlyBillingInput(w.deps(), q("month=2026-10")));
    expect(r.body.students[0].occurrences.find((o: { date: string }) => o.date === "2026-10-26")).toMatchObject({ schedulerState: "cancelled", chargeState: "not_charged" });
    expect(w.writes).toEqual([]);
    expect(w.outcomes.calls).toEqual(["listForOccurrences"]);
    expect(w.notionWrites).toEqual([]);
  });

  it("names nothing but ids: no student or teacher names, no emails", async () => {
    const w = await setup();
    const text = JSON.stringify((await read(await handleMonthlyBillingInput(w.deps(), q("month=2026-10")))).body);
    expect(text).not.toMatch(/Ryan|Kuby|@example\.com/);
  });
});

describe("GET /monthly-billing-input refusals (AC5)", () => {
  it.each([
    ["a scheduler teacher", teacher, 403, "forbidden"],
    ["a parent (scope none)", { scope: "none" } as SchedulerIdentity, 403, "forbidden"],
    ["signed out", { scope: "signed_out" } as SchedulerIdentity, 401, "unauthenticated"],
    ["unconfigured", { scope: "unconfigured" } as SchedulerIdentity, 503, "scheduler_not_configured"],
  ])("%s gets %i before any read", async (_who, identity, status, error) => {
    const w = await setup();
    const r = await read(await handleMonthlyBillingInput(w.deps(identity), q("month=2026-10")));
    expect(r).toMatchObject({ status, body: { error } });
    expect(w.calls).toEqual([]);
  });

  it.each(["", "month=2026-13", "month=26-10", "month=2026-10-01"])("a missing or malformed month (%s) is 400", async (s) => {
    const w = await setup();
    expect((await read(await handleMonthlyBillingInput(w.deps(), q(s)))).status).toBe(400);
  });

  it("a store read that fails is 503, never an empty 200", async () => {
    const w = await setup();
    const deps = w.deps();
    const broken: ScheduleDeps = { ...deps, store: { ...deps.store, listSeriesForStudent: async () => { throw new Error("down"); } } };
    expect(await read(await handleMonthlyBillingInput(broken, q("month=2026-10")))).toMatchObject({ status: 503, body: { error: "scheduler_unavailable" } });
    const noSummaries: ScheduleDeps = { ...deps, store: { ...deps.store, listSummaries: async () => { throw new Error("down"); } } };
    expect((await read(await handleMonthlyBillingInput(noSummaries, q("month=2026-10")))).status).toBe(503);
    const noOutcomes: ScheduleDeps = { ...deps, outcomes: { ...deps.outcomes!, listForOccurrences: async () => { throw new Error("down"); } } };
    expect((await read(await handleMonthlyBillingInput(noOutcomes, q("month=2026-10")))).status).toBe(503);
  });

  it("without the outcome store it answers 503 lessons_not_ready rather than guess", async () => {
    const w = await setup();
    const r = await read(await handleMonthlyBillingInput({ ...w.deps(), outcomes: undefined }, q("month=2026-10")));
    expect(r).toMatchObject({ status: 503, body: { error: "lessons_not_ready" } });
  });
});

describe("loadBillingMonth (the page's loader)", () => {
  it("returns the export plus each student's last written text, series and exceptions", async () => {
    const w = await setup();
    const r = await loadBillingMonth(w.deps(), "2026-10");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.students.map((s) => [s.studentId, s.text, s.series.length])).toEqual([[S1, "", 1], [S2, "", 1]]);
    expect(r.input.students.length).toBe(2);
  });
  it("refuses a teacher with 403", async () => {
    const w = await setup();
    expect(await loadBillingMonth(w.deps(teacher), "2026-10")).toMatchObject({ ok: false, status: 403 });
  });
});
