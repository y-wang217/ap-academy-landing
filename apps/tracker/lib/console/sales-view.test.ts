import { describe, expect, it } from "vitest";
import { fixtureLeads, lead, LEAD_IDS, SALES_NOW, TRIAL_F } from "../../test/console/sales-fixtures";
import type { ConsolePanels, LeadRow, PanelResult, TouchGroup, TrialLessonRow } from "./contracts";
import { loadConsolePanels, PAGE_CAP_PREFIX, type FacadeDeps, type NotionPorts } from "./facade";
import { buildSalesView, SalesViewSchema } from "./sales-view";

// REQ-57 AC3, AC4, AC6, AC8, AC9: the sales view over the facade's panels.
const AT = SALES_NOW.toISOString();
function result<T>(panel: string, status: PanelResult<T>["status"], data: T | null, extra: Partial<PanelResult<T>> = {}): PanelResult<T> {
  return {
    panel: panel as PanelResult<T>["panel"], status, data, count: Array.isArray(data) ? data.length : null, lastCheckedAt: AT,
    lastSuccessfulFetchAt: status === "error" ? null : AT, staleReason: null, errorMessage: status === "error" ? "Timed out after 8 s" : null,
    sourceEvidence: [{ source: "notion", sourceId: panel, sourceUrl: null, observedAt: AT }], ...extra,
  };
}
const TOUCH: TouchGroup = {
  studentId: LEAD_IDS.A, studentName: "Lead A",
  touches: [
    { id: "t1", pageUrl: "https://www.notion.so/t1", when: "2026-10-20T15:00:00.000Z", whenDate: "2026-10-20", type: "Call", outcome: "No answer", studentId: LEAD_IDS.A, staffId: "s1", staffName: "Ryan Test", note: "Left a voicemail" },
    { id: "t2", pageUrl: "https://www.notion.so/t2", when: "2026-10-21T15:00:00.000Z", whenDate: "2026-10-21", type: "Text", outcome: "Replied", studentId: LEAD_IDS.A, staffId: "s1", staffName: "Ryan Test", note: "Asked for Thursday" },
  ],
};
function panels(over: Partial<ConsolePanels> = {}, leads: LeadRow[] = fixtureLeads(), trials: TrialLessonRow[] = [TRIAL_F]): ConsolePanels {
  return {
    leads: result("leads", "ready", leads),
    touches: result("touches", "ready", [TOUCH]),
    trialLessons: result("trialLessons", "ready", trials),
    work: result("work", "empty", []),
    invoices: result("invoices", "empty", []),
    people: result("people", "ready", { syncedAt: AT, students: 1, staff: 1 }),
    ...over,
  };
}
const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  }
  return out;
};

describe("buildSalesView", () => {
  it("a ready read gives a ready queue and a five-row radar counted by base bucket (AC9)", () => {
    const v = buildSalesView(panels(), SALES_NOW);
    expect(v.queue.status).toBe("ready");
    expect(v.queue.data?.items).toHaveLength(11);
    expect(v.queue.data?.mergedDuplicates).toBe(1);
    expect(v.queue.data?.truncated).toBe(false);
    expect(v.queue.count).toBe(11);
    expect(v.radar.status).toBe("ready");
    expect(v.radar.data).toEqual([
      { key: "new", label: "New", count: 2 }, { key: "callback", label: "Callback due", count: 1 }, { key: "postTrial", label: "Post-trial", count: 2 },
      { key: "followUp", label: "Follow-up due", count: 3 }, { key: "later", label: "Later", count: 3 },
    ]);
    expect(v.queue.sourceEvidence.map((e) => e.sourceId)).toEqual(["leads", "touches", "trialLessons"]);
  });

  it("maps filters by base bucket", () => {
    const items = buildSalesView(panels(), SALES_NOW).queue.data!.items;
    const of = (k: keyof typeof LEAD_IDS) => items.find((i) => i.id === LEAD_IDS[k])!;
    expect([of("A").filter, of("C").filter, of("G").filter, of("E").filter, of("I").filter]).toEqual(["new", "due", "due", "postTrial", "later"]);
  });

  it("leads error gives queue and radar error, with no data (AC6, AC9)", () => {
    const v = buildSalesView(panels({ leads: result("leads", "error", null as never) }), SALES_NOW);
    expect([v.queue.status, v.radar.status]).toEqual(["error", "error"]);
    expect(v.queue.data).toBeNull();
    expect(v.queue.errorMessage).toBe("Timed out after 8 s");
  });

  it("leads stopped at the page cap is stale and truncated, never empty (AC6)", () => {
    const reason = `${PAGE_CAP_PREFIX}10 pages; showing 0 rows`;
    const v = buildSalesView(panels({ leads: result("leads", "stale", [], { staleReason: reason }) }), SALES_NOW);
    expect(v.queue.status).toBe("stale");
    expect(v.queue.staleReason).toBe(reason);
    expect(v.queue.data?.truncated).toBe(true);
    expect(v.radar.status).toBe("stale");
  });

  it("leads stale only for names is stale but not truncated", () => {
    const v = buildSalesView(panels({ leads: result("leads", "stale", fixtureLeads(), { staleReason: "people_sync_stale" }) }), SALES_NOW);
    expect(v.queue.status).toBe("stale");
    expect(v.queue.data?.truncated).toBe(false);
  });

  it("no eligible row is empty", () => {
    const v = buildSalesView(panels({}, [lead("O", { stage: "Active" })]), SALES_NOW);
    expect([v.queue.status, v.radar.status]).toEqual(["empty", "empty"]);
  });

  it("trial lessons failing with a Trial Claimed row is stale with the trial reason (AC4)", () => {
    const v = buildSalesView(panels({ trialLessons: result("trialLessons", "error", null as never) }), SALES_NOW);
    expect(v.queue.status).toBe("stale");
    expect(v.queue.staleReason).toBe("Trial lessons unavailable; post-trial order may be incomplete");
    const f = v.queue.data!.items.find((i) => i.id === LEAD_IDS.F)!;
    expect(f.trial?.lesson).toEqual({ state: "unavailable" });
    const capped = buildSalesView(panels({ trialLessons: result("trialLessons", "stale", [TRIAL_F], { staleReason: `${PAGE_CAP_PREFIX}10 pages; showing 1 rows` }) }), SALES_NOW);
    expect(capped.queue.status).toBe("stale");
    const noClaim = buildSalesView(panels({ trialLessons: result("trialLessons", "error", null as never) }, [lead("A", { stage: "New" })]), SALES_NOW);
    expect(noClaim.queue.status).toBe("ready");
  });

  it("carries the Rolodex fields: trial lesson found, owner states, last touch (AC4, AC8)", () => {
    const leads = [
      lead("A", { stage: "New", ownerStaffId: "s1", ownerName: "Ryan Test", grade: "11", subjects: ["MHF4U"], source: "Meta form" }),
      lead("B", { stage: "New", ownerStaffId: "s9", ownerName: null }),
      lead("F", { stage: "Trial Claimed", nextAction: "Close call", majorGaps: "Factoring", trialSummary: null, level: "Solid" }),
    ];
    const items = buildSalesView(panels({}, leads), SALES_NOW).queue.data!.items;
    const a = items.find((i) => i.id === LEAD_IDS.A)!;
    expect([a.ownerState, a.ownerName, a.grade, a.subjects, a.source]).toEqual(["named", "Ryan Test", "11", ["MHF4U"], "Meta form"]);
    expect(a.lastTouch).toMatchObject({ state: "found", type: "Text", outcome: "Replied", note: "Asked for Thursday", staffName: "Ryan Test" });
    expect(a.trial).toBeNull();
    const b = items.find((i) => i.id === LEAD_IDS.B)!;
    expect(b.ownerState).toBe("unknown");
    expect(b.lastTouch).toEqual({ state: "none" });
    const f = items.find((i) => i.id === LEAD_IDS.F)!;
    expect(f.trial).toMatchObject({ majorGaps: "Factoring", trialSummary: null, level: "Solid" });
    expect(f.trial?.lesson).toEqual({ state: "found", pageUrl: TRIAL_F.pageUrl, date: "2026-10-20", diagnosis: "Needs factoring practice", preferredDays: ["Tue"] });
    const unassigned = buildSalesView(panels({}, [lead("A", { stage: "New" })]), SALES_NOW).queue.data!.items[0];
    expect(unassigned.ownerState).toBe("unassigned");
  });

  it("touches error gives lastTouch unavailable", () => {
    const items = buildSalesView(panels({ touches: result("touches", "error", null as never) }), SALES_NOW).queue.data!.items;
    expect(items.every((i) => i.lastTouch.state === "unavailable")).toBe(true);
  });

  it("the wire view holds no dedupe key, Lead ID, phone or email (AC8)", () => {
    const leads = fixtureLeads().map((l) => ({ ...l, dedupeKey: l.dedupeKey ?? "lead-secret-77" }));
    const v = buildSalesView(panels({}, leads), SALES_NOW);
    const keys = keysDeep(v);
    for (const k of ["dedupeKey", "leadId", "parentPhone", "parentEmail", "phone", "email"]) expect(keys.has(k), k).toBe(false);
    expect(JSON.stringify(v)).not.toMatch(/lead-secret-77|"m-1"|tel:/);
    expect(SalesViewSchema.parse(v)).toEqual(v);
  });
});

describe("facade integration (T2)", () => {
  const ok = <T,>(rows: T[], complete = true) => ({ rows, complete, skipped: 0, pages: 1 });
  const src = (l: LeadRow) => ({
    id: l.id, createdAt: l.createdAt, name: l.name, stage: l.stage, ownerStaffId: null, nextAction: l.nextAction, nextActionDue: l.nextActionDue,
    attempts: null, lastContact: l.lastContact, source: null, lostReason: l.lostReason, contactedAt: null, trialBookedAt: null, trialAttendedAt: null,
    closedAt: null, trialTime: null, trialTeacherId: null, level: null, hasMajorGaps: false, recommendedPlan: null, hasTrialSummary: false,
    parentName: null, leadId: l.dedupeKey, grade: null, subjects: [], majorGaps: null, trialSummary: null,
  });
  const ports: NotionPorts = {
    leads: async () => ok(fixtureLeads().map(src), false),
    touches: () => new Promise(() => {}),
    trialLessons: async () => ok([]),
    work: async () => ok([]),
    invoices: async () => ok([]),
  };
  const deps: FacadeDeps = {
    orgId: "o1", now: () => SALES_NOW, notion: ports, timeoutMs: 50, maxPages: 1, touchesPerStudent: 5, touchesWindowDays: 90, freshness: new Map(),
    sources: { leads: "l", touches: "t", trialLessons: "tl", work: "w", invoices: "i" },
    people: async () => ({ students: [], staff: [], syncedAt: AT }),
  };

  it("a truncated leads read and a timed-out touches read stay stale with the rows, never Queue clear", async () => {
    const v = buildSalesView(await loadConsolePanels(deps), SALES_NOW);
    expect(v.queue.status).toBe("stale");
    expect(v.queue.data?.truncated).toBe(true);
    expect(v.queue.data?.items.length).toBeGreaterThan(0);
    expect(v.queue.data?.items.every((i) => i.lastTouch.state === "unavailable")).toBe(true);
  });
});
