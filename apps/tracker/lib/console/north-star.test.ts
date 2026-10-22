import { describe, expect, it } from "vitest";
import type { SeriesFact } from "../domain/schedule/net-new";
import { weekOf } from "../domain/schedule/week";
import type { ConsolePanels, InvoiceRow, LeadRow, PanelResult, PanelStatus } from "./contracts";
import type { PeopleSnapshot } from "./facade";
import { buildNorthStar, comparisonLine, type NorthStarInput } from "./north-star";

// REQ-56 AC4, AC6, AC7, AC8, AC10 (T2): the north-star panel over fake facade panels, people and series reads.
const NOW = new Date("2026-10-22T16:00:00.000Z"); // 12:00 Toronto
const W = weekOf("2026-10-22");
const S1 = "a0000000-0000-4000-8000-000000000001";
const S2 = "a0000000-0000-4000-8000-000000000002";
const STAFF = "b0000000-0000-4000-8000-000000000001";
const INVOICES_FETCHED = "2026-10-22T15:59:00.000Z";

function result<T>(panel: PanelResult<T>["panel"], status: PanelStatus, data: T | null, staleReason: string | null = null): PanelResult<T> {
  return {
    panel, status, data, count: Array.isArray(data) ? data.length : null, lastCheckedAt: NOW.toISOString(),
    lastSuccessfulFetchAt: status === "error" ? null : INVOICES_FETCHED, staleReason, errorMessage: status === "error" ? "Timed out after 8 s" : null,
    sourceEvidence: [{ source: "notion", sourceId: `${panel}-source`, sourceUrl: null, observedAt: NOW.toISOString() }],
  };
}
const invoice = (studentId: string, status = "Paid"): InvoiceRow => ({
  id: `inv-${studentId}`, pageUrl: "https://www.notion.so/x", status, paidOn: status === "Paid" ? "2026-10-01" : null, amount: 240, creditApplied: null,
  issued: "2026-10-01", due: "2026-10-15", month: "2026-10", studentIds: [studentId.replaceAll("-", "")], studentName: null,
});
const lead = (over: Partial<LeadRow>): LeadRow => ({
  id: "l", pageUrl: "u", createdAt: null, name: "Lead", stage: "New", ownerStaffId: null, ownerName: null, nextAction: "Call", nextActionDue: null, nextActionDueDate: null,
  attempts: null, lastContact: null, source: null, lostReason: null, contactedAt: null, trialBookedAt: null, trialAttendedAt: null, closedAt: null, trialTime: null,
  trialTimeDate: null, trialTeacherId: null, trialTeacherName: null, level: null, hasMajorGaps: false, recommendedPlan: null, hasTrialSummary: false, parentName: null,
  inPeopleCopy: false, ...over,
});

function panels(over: Partial<ConsolePanels> = {}): ConsolePanels {
  return {
    leads: result("leads", "ready", [
      lead({ id: "l1", stage: "New" }), lead({ id: "l2", stage: "New", nextActionDue: "2026-10-22T14:00:00Z" }),
      lead({ id: "l3", stage: "Working", nextActionDue: "2026-10-21" }), lead({ id: "l4", stage: "Working", nextActionDue: "2026-10-23T14:00:00Z" }),
      lead({ id: "l5", stage: "Lost", nextActionDue: "2026-10-20T14:00:00Z" }), lead({ id: "l6", stage: "Working", nextAction: "None", nextActionDue: "2026-10-20T14:00:00Z" }),
      lead({ id: "l7", stage: "Churned", nextActionDue: "2026-10-20T14:00:00Z" }),
    ]),
    touches: result("touches", "ready", []),
    trialLessons: result("trialLessons", "ready", []),
    work: result("work", "ready", []),
    invoices: result("invoices", "ready", [invoice(S1), invoice(S2, "Sent")]),
    people: result("people", "ready", { syncedAt: null, students: 2, staff: 1 }),
    ...over,
  };
}
const people = (minutesAgo = 10): PeopleSnapshot => ({
  students: [{ id: S1, name: "Sam R.", stage: "Active", active: true }, { id: S2, name: "Lee K.", stage: "Active", active: true }],
  staff: [{ id: STAFF, name: "Ryan", active: true }],
  syncedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
});
let n = 0;
const series = (over: Partial<SeriesFact> = {}): SeriesFact => ({
  id: `c0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, studentId: S1, staffId: STAFF, kind: "weekly", purpose: null,
  startDate: "2026-10-21", effectiveUntil: null, durationMinutes: 60, splitFrom: null, createdAt: "2026-10-21T15:00:00Z", ...over,
});
const adoptions = [S1, S2].map((studentId) => ({ studentId, adoptedAt: "2026-09-01T10:00:00Z" }));

function input(over: Partial<NorthStarInput> = {}, rows: SeriesFact[] = [series()]): NorthStarInput {
  return { week: W, now: NOW, panels: panels(), people: { ok: true, value: people() }, series: { ok: true, value: { series: rows, adoptions } }, ...over };
}

describe("buildNorthStar", () => {
  it("verified: ready, the computed week, evidence and the older fetch time", () => {
    const v = buildNorthStar(input());
    expect(v.panel).toBe("northStar");
    expect(v.status).toBe("ready");
    expect(v.data?.current.netNewVerifiedMinutes).toBe(60);
    expect(v.data?.weekLabel).toBe("Mon 19 Oct to Sun 25 Oct");
    expect(v.data?.names[S1.replaceAll("-", "")]).toBe("Sam R.");
    expect(v.sourceEvidence.map((e) => e.sourceId)).toEqual(["tracker.class_series", "tracker.schedule_summaries", "tracker.student_people", "invoices-source"]);
    expect(v.lastSuccessfulFetchAt).toBe(INVOICES_FETCHED);
    expect(v.count).toBe(1);
  });

  it("an empty verified week is empty", () => {
    expect(buildNorthStar(input({}, [])).status).toBe("empty");
  });

  it.each([
    ["Invoices error", panels({ invoices: result<InvoiceRow[]>("invoices", "error", null) }), "Cannot verify weekly hours: Timed out after 8 s"],
    ["Invoices stopped at the page cap", panels({ invoices: result("invoices", "stale", [invoice(S1)], "Stopped after 10 pages; showing 1000 rows") }), "Cannot verify weekly hours: Stopped after 10 pages; showing 1000 rows"],
  ])("%s: unverifiable with gross figures and no classified figure (AC4)", (_, p, reason) => {
    const v = buildNorthStar(input({ panels: p }, [series(), series({ startDate: "2026-09-01", effectiveUntil: "2026-10-20" })]));
    expect(v.status).toBe("unverifiable");
    expect(v.staleReason).toBe(reason);
    expect(v.data?.current.netNewVerifiedMinutes).toBeNull();
    expect([v.data?.current.grossAdditionsMinutes, v.data?.current.grossReductionsMinutes]).toEqual([60, 60]);
    expect(v.data?.comparison).toBeNull();
  });

  it("Invoices stale only because of the people copy stays usable", () => {
    const v = buildNorthStar(input({ panels: panels({ invoices: result("invoices", "stale", [invoice(S1)], "people_sync_stale") }) }));
    expect(v.data?.current.netNewVerifiedMinutes).toBe(60);
    expect(v.status).not.toBe("unverifiable");
  });

  it("a stale people copy is stale with the sync time (AC7)", () => {
    const v = buildNorthStar(input({ people: { ok: true, value: people(180) } }));
    expect(v.status).toBe("stale");
    expect(v.staleReason).toBe("Student stages last synced 09:00; figures may be incomplete");
    expect(v.data?.current.netNewVerifiedMinutes).toBe(60);
  });

  it("people never synced is stale and says so", () => {
    const v = buildNorthStar(input({ people: { ok: true, value: { ...people(), syncedAt: null } } }));
    expect(v.status).toBe("stale");
    expect(v.staleReason).toBe("Student stages never synced; figures may be incomplete");
  });

  it("a failed people read is unverifiable", () => {
    const v = buildNorthStar(input({ people: { ok: false } }));
    expect(v.status).toBe("unverifiable");
    expect(v.staleReason).toBe("Cannot verify weekly hours: Student stages unavailable");
  });

  it("a failed series read is error, and the panels it was given are untouched (AC8)", () => {
    const p = panels();
    const before = JSON.stringify(p);
    const v = buildNorthStar(input({ panels: p, series: { ok: false } }));
    expect(v.status).toBe("error");
    expect(v.errorMessage).toBe("Cannot verify weekly hours");
    expect(v.data).toBeNull();
    expect(JSON.stringify(p)).toBe(before);
  });

  it.each([
    ["Invoices error", { panels: panels({ invoices: result<InvoiceRow[]>("invoices", "error", null) }) }],
    ["people failure", { people: { ok: false } as const }],
  ])("a failed series read wins over %s", (_, over) => {
    expect(buildNorthStar(input({ ...over, series: { ok: false } })).status).toBe("error");
  });

  it("AC6 (a): both weeks verified, prior +60 and this week +90: +0.5 h (+50%)", () => {
    const v = buildNorthStar(input({}, [series({ startDate: "2026-10-14" }), series({ durationMinutes: 90 })]));
    expect(v.data?.comparison).toEqual({ deltaMinutes: 30, percent: 50 });
    expect(comparisonLine(v.data!.comparison!)).toBe("vs last week +0.5 h (+50%)");
  });

  it("AC6 (b): prior week verified 0, this week +90: hours only", () => {
    const v = buildNorthStar(input({}, [series({ durationMinutes: 90 })]));
    expect(v.data?.comparison).toEqual({ deltaMinutes: 90, percent: null });
    expect(comparisonLine(v.data!.comparison!)).toBe("vs last week +1.5 h");
  });

  it("AC6 (c): a stale people copy (both weeks incomplete) gives no comparison", () => {
    expect(buildNorthStar(input({ people: { ok: true, value: people(180) } }, [series({ startDate: "2026-10-14" }), series()])).data?.comparison).toBeNull();
  });

  it("AC10: lead readouts from a usable leads panel, capacity from the series", () => {
    const v = buildNorthStar(input({}, [series(), series({ startDate: "2026-09-01", durationMinutes: 90 }), series({ startDate: "2026-09-01", effectiveUntil: "2026-10-10" }), series({ kind: "one_off", purpose: "extra" })]));
    expect(v.data?.diagnostics.leads).toEqual({ awaitingFirstContact: 2, overdueFollowUps: 2 });
    expect(v.data?.diagnostics.bookedMinutes).toBe(150);
  });

  it("AC10: an unusable leads panel gives no lead readouts", () => {
    expect(buildNorthStar(input({ panels: panels({ leads: result<LeadRow[]>("leads", "error", null) }) })).data?.diagnostics.leads).toBeNull();
    expect(buildNorthStar(input({ panels: panels({ leads: result<LeadRow[]>("leads", "stale", [], "Stopped after 10 pages; showing 0 rows") }) })).data?.diagnostics.leads).toBeNull();
  });

  it("week links: previous always, next only before the current week (AC9)", () => {
    expect(buildNorthStar(input()).data?.links).toEqual({ previous: "?mode=sales&week=2026-10-12", next: null, retry: "?mode=sales&week=2026-10-19" });
    expect(buildNorthStar(input({ week: weekOf("2026-10-14") })).data?.links.next).toBe("?mode=sales&week=2026-10-19");
  });
});
