import { describe, expect, it } from "vitest";
import type { ConsolePanels, InvoiceRow, LeadRow, PanelResult, TrialLessonRow } from "./contracts";
import { buildCashPulsePanel, buildTrialFunnelPanel } from "./finance-panels";
import { windowOf } from "./trial-funnel";

// REQ-59 AC5, AC6: the panel statuses over a fake facade result (Decision 18).
const NOW = new Date("2026-10-22T16:00:00.000Z");
const WINDOW = windowOf(30, "2026-10-22");
const SEARCH = new URLSearchParams({ mode: "operations", week: "2026-10-12" });
const T1 = "2026-10-22T15:59:00.000Z";
const T0 = "2026-10-22T15:30:00.000Z";
const LEAD = "a0000000-0000-4000-8000-000000000001";

const lead = (extra: Partial<LeadRow>): LeadRow => ({
  id: LEAD, pageUrl: "https://www.notion.so/lead1", createdAt: null, name: "Lead 1", stage: null, ownerStaffId: null, ownerName: null, nextAction: null,
  nextActionDue: null, nextActionDueDate: null, attempts: null, lastContact: null, source: null, lostReason: null, contactedAt: null, trialBookedAt: "2026-10-01",
  trialAttendedAt: "2026-10-03", closedAt: "2026-10-10", trialTime: "2026-10-03T15:00:00Z", trialTimeDate: null, trialTeacherId: null, trialTeacherName: null, level: null,
  hasMajorGaps: false, recommendedPlan: null, hasTrialSummary: false, parentName: null, inPeopleCopy: true, ...extra,
});
const lesson: TrialLessonRow = {
  id: "c0000000-0000-4000-8000-000000000001", pageUrl: "https://www.notion.so/lesson1", date: "2026-10-03", studentId: LEAD, studentName: null, teacherId: null,
  teacherName: null, durationHours: 1, hasTopic: false, hasDiagnosis: false, preferredDays: [],
};
const invoice: InvoiceRow = {
  id: "e0000000-0000-4000-8000-000000000001", pageUrl: "https://www.notion.so/inv1", status: "Paid", paidOn: "2026-10-05", amount: 480, creditApplied: null,
  issued: "2026-10-01", due: null, month: "2026-10", studentIds: [LEAD], studentName: "Lead 1",
};

function result<T>(panel: PanelResult<T>["panel"], data: T, extra: Partial<PanelResult<T>> = {}): PanelResult<T> {
  return {
    panel, status: "ready", data, count: Array.isArray(data) ? data.length : null, lastCheckedAt: T1, lastSuccessfulFetchAt: T1, staleReason: null, errorMessage: null,
    sourceEvidence: [{ source: "notion", sourceId: `${panel}-ds`, sourceUrl: `https://www.notion.so/${panel}`, observedAt: T1 }], ...extra,
  };
}
const errored = <T>(panel: PanelResult<T>["panel"], message: string): PanelResult<T> =>
  ({ ...result<T>(panel, null as T), status: "error", data: null, errorMessage: message, lastSuccessfulFetchAt: T0 });
const capped = <T>(panel: PanelResult<T>["panel"], data: T): PanelResult<T> => result(panel, data, { status: "stale", staleReason: "Stopped after 10 pages; showing 1000 rows" });

function panels(over: Partial<ConsolePanels> = {}): ConsolePanels {
  return {
    leads: result("leads", [lead({})]),
    touches: result("touches", []),
    trialLessons: result("trialLessons", [lesson]),
    work: result("work", []),
    invoices: result("invoices", [invoice]),
    people: result("people", { syncedAt: T1, students: 1, staff: 0 }),
    ...over,
  };
}
const funnel = (p: ConsolePanels) => buildTrialFunnelPanel(p, WINDOW, NOW, SEARCH);
const cash = (p: ConsolePanels) => buildCashPulsePanel(p, WINDOW, NOW, SEARCH);
const state = (f: ReturnType<typeof funnel>) => (["booked", "delivered", "closed", "verified", "outcomeUnknown"] as const)
  .map((k) => (f.data![k].state === "ok" ? (f.data![k] as { count: number }).count : "unverifiable"));

describe("all reads complete", () => {
  it("both panels are ready with the window links kept on the other parameters", () => {
    const f = funnel(panels());
    expect(f.status).toBe("ready");
    expect(state(f)).toEqual([1, 1, 1, 1, 0]);
    expect(f.data!.links).toEqual({
      label: "Last 30 days, Wed 23 Sep to Thu 22 Oct",
      others: [{ days: 7, href: "?mode=operations&week=2026-10-12&window=7" }, { days: 90, href: "?mode=operations&week=2026-10-12&window=90" }],
      operations: "?mode=operations&window=30",
    });
    const c = cash(panels());
    expect(c.status).toBe("ready");
    expect(c.data!.collected.cents).toBe(48000);
    expect(c.count).toBe(1);
  });

  it("source evidence is the union and the last success the oldest", () => {
    const p = panels({ trialLessons: result("trialLessons", [lesson], { lastSuccessfulFetchAt: T0 }) });
    const f = funnel(p);
    expect(f.sourceEvidence.map((e) => e.sourceId)).toEqual(["leads-ds", "trialLessons-ds", "invoices-ds"]);
    expect(f.lastSuccessfulFetchAt).toBe(T0);
    expect(funnel(panels({ invoices: result("invoices", [invoice], { lastSuccessfulFetchAt: null }) })).lastSuccessfulFetchAt).toBeNull();
  });

  it("empty variants come only from complete reads", () => {
    expect(funnel(panels({ leads: result("leads", []), trialLessons: result("trialLessons", []) })).status).toBe("empty");
    expect(cash(panels({ invoices: result("invoices", [], { status: "empty" }) })).status).toBe("empty");
    expect(funnel(panels({ leads: result("leads", []), trialLessons: errored("trialLessons", "Notion returned 500") })).status).toBe("stale");
  });

  it("a complete ledger with nothing paid in the window is ready at 0, a fact", () => {
    const c = cash(panels({ invoices: result("invoices", [{ ...invoice, paidOn: "2026-01-05" }]) }));
    expect(c.status).toBe("ready");
    expect(c.data!.collected.cents).toBe(0);
  });
});

describe("failures (Decision 18)", () => {
  it("Invoices error: cash unverifiable with no data; funnel stale with only verified unverifiable", () => {
    const p = panels({ invoices: errored("invoices", "Notion returned 500") });
    const c = cash(p);
    expect(c).toMatchObject({ status: "unverifiable", data: null, staleReason: "Payment records unavailable: Notion returned 500" });
    const f = funnel(p);
    expect(f.status).toBe("stale");
    expect(state(f)).toEqual([1, 1, 1, "unverifiable", 0]);
    expect(f.staleReason).toBe("Payment records unavailable: verified enrolments unverifiable");
  });

  it("Invoices stopped at the page cap: cash unverifiable with no figures", () => {
    const c = cash(panels({ invoices: capped("invoices", [invoice]) }));
    expect(c.status).toBe("unverifiable");
    expect(c.data).toBeNull();
    expect(c.staleReason).toContain("totals not shown");
  });

  it("Invoices stale only by people_sync_stale is complete: cash ready", () => {
    expect(cash(panels({ invoices: result("invoices", [invoice], { status: "stale", staleReason: "people_sync_stale" }) })).status).toBe("ready");
  });

  it("Lessons error: funnel stale, delivered and outcome unknown unverifiable; cash unchanged", () => {
    const p = panels({ trialLessons: errored("trialLessons", "Timed out after 8 s") });
    const f = funnel(p);
    expect(f.status).toBe("stale");
    expect(state(f)).toEqual([1, "unverifiable", 1, 1, "unverifiable"]);
    expect(cash(p).status).toBe("ready");
  });

  it("Leads error: only the funnel is unverifiable", () => {
    const p = panels({ leads: errored("leads", "Notion returned 500") });
    expect(funnel(p)).toMatchObject({ status: "unverifiable", data: null, staleReason: "Trial records unavailable: Notion returned 500" });
    expect(cash(p).status).toBe("ready");
  });

  it("Leads stopped at the page cap: funnel unverifiable", () => {
    expect(funnel(panels({ leads: capped("leads", [lead({})]) }))).toMatchObject({ status: "unverifiable", data: null });
  });

  it("a throwing computation is error Read failed", () => {
    const bad = result("leads", [lead({})]);
    Object.defineProperty(bad.data![0], "trialBookedAt", { get() { throw new Error("boom"); } });
    expect(funnel(panels({ leads: bad }))).toMatchObject({ status: "error", errorMessage: "Read failed", data: null });
    const badCash = result("invoices", [invoice]);
    Object.defineProperty(badCash.data![0], "status", { get() { throw new Error("boom"); } });
    expect(cash(panels({ invoices: badCash }))).toMatchObject({ status: "error", errorMessage: "Read failed" });
  });

  it("messages are cut to 300 characters", () => {
    expect(cash(panels({ invoices: errored("invoices", "x".repeat(400)) })).staleReason!.length).toBe(300);
  });
});
