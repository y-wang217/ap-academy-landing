import { describe, expect, it } from "vitest";
import { fixtureLeads, LEAD_IDS, SALES_NOW, TRIAL_F } from "../../test/console/sales-fixtures";
import type { ConsolePanels, LeadRow, PanelResult } from "./contracts";
import { PAGE_CAP_PREFIX } from "./facade";
import {
  filterCounts, initialSalesState, nextAfter, queueKeyTarget, retainedView, salesReducer, selectedOf, shouldRefreshOnSync, visibleItems,
  type SalesAction, type SalesState,
} from "./sales-state";
import { buildSalesView, type SalesView } from "./sales-view";

// REQ-57 AC1, AC3, AC6, AC7: the client queue state, pure.
const AT = SALES_NOW.toISOString();
const LATER = "2026-10-22T16:07:00.000Z"; // 12:07 Toronto
function leadsResult(status: PanelResult<LeadRow[]>["status"], data: LeadRow[] | null, extra: Partial<PanelResult<LeadRow[]>> = {}): PanelResult<LeadRow[]> {
  return {
    panel: "leads", status, data, count: data?.length ?? null, lastCheckedAt: AT, lastSuccessfulFetchAt: status === "error" ? null : AT,
    staleReason: null, errorMessage: status === "error" ? "Timed out after 8 s" : null, sourceEvidence: [], ...extra,
  };
}
function view(leads: PanelResult<LeadRow[]> = leadsResult("ready", fixtureLeads())): SalesView {
  const empty = { ...leadsResult("empty", []), panel: "work" } as unknown as PanelResult<never[]>;
  const panels = {
    leads, touches: { ...empty, panel: "touches" }, trialLessons: { ...leadsResult("ready", []), panel: "trialLessons", data: [TRIAL_F] },
    work: empty, invoices: { ...empty, panel: "invoices" }, people: { ...empty, panel: "people", data: { syncedAt: AT, students: 0, staff: 0 } },
  } as unknown as ConsolePanels;
  return buildSalesView(panels, SALES_NOW);
}
const run = (state: SalesState, ...actions: SalesAction[]) => actions.reduce(salesReducer, state);
const ids = (s: SalesState) => visibleItems(s).map((i) => i.id);
const selectedInvariant = (s: SalesState) => {
  const visible = visibleItems(s);
  const sel = selectedOf(s);
  if (visible.length === 0) expect(sel).toBeNull();
  else expect(visible.filter((i) => i.id === sel)).toHaveLength(1);
};

describe("salesReducer", () => {
  const start = initialSalesState(view());

  it("starts with the first item selected and the view as last good (AC1)", () => {
    expect(selectedOf(start)).toBe(LEAD_IDS.A);
    expect(start.lastGood).not.toBeNull();
    expect(retainedView(start).status).toBe("ready");
  });

  it("a failed refresh keeps the previous queue with the AC6 line, and Retry success clears it (AC6)", () => {
    const failed = run(start, { type: "select", id: LEAD_IDS.C }, { type: "refreshStart" }, { type: "refreshFailed", message: "Network error", at: LATER });
    expect(failed.fetch).toBe("idle");
    expect(ids(failed)).toEqual(ids(start));
    expect(selectedOf(failed)).toBe(LEAD_IDS.C);
    const r = retainedView(failed);
    expect(r.status).toBe("stale");
    expect(r.staleReason).toBe("Refresh failed at 12:07: Network error. Showing the queue from 12:00.");
    expect(r.lastCheckedAt).toBe(LATER);
    expect(r.lastSuccessfulFetchAt).toBe(AT);
    const retried = run(failed, { type: "refreshStart" }, { type: "refreshOk", view: view(), at: LATER });
    expect(retried.failure).toBeNull();
    expect(retainedView(retried).status).toBe("ready");
    expect(retainedView(retried).staleReason).toBeNull();
  });

  it("a 200 whose queue is error keeps the previous queue", () => {
    const s = run(start, { type: "refreshOk", view: view(leadsResult("error", null)), at: LATER });
    expect(ids(s)).toEqual(ids(start));
    expect(retainedView(s).staleReason).toBe("Refresh failed at 12:07: Timed out after 8 s. Showing the queue from 12:00.");
  });

  it("a truncated read after a good one keeps the previous queue (AC6)", () => {
    const reason = `${PAGE_CAP_PREFIX}10 pages; showing 3 rows`;
    const s = run(start, { type: "refreshOk", view: view(leadsResult("stale", fixtureLeads().slice(0, 3), { staleReason: reason })), at: LATER });
    expect(ids(s)).toEqual(ids(start));
    expect(retainedView(s).staleReason).toBe(`Latest read incomplete: ${reason}. Showing the queue from 12:00.`);
  });

  it("a failure with no good queue shows the kit error state", () => {
    const first = initialSalesState(view(leadsResult("error", null)));
    expect(first.lastGood).toBeNull();
    const s = run(first, { type: "refreshFailed", message: "Network error", at: LATER });
    expect(retainedView(s).status).toBe("error");
    expect(retainedView(s).errorMessage).toBe("Network error");
    expect(s.failure).not.toBeNull();
  });

  it("a selected row turned Lost leaves, and the selection moves to the first item (AC3)", () => {
    const picked = run(start, { type: "select", id: LEAD_IDS.C });
    const lost = fixtureLeads().map((l) => (l.id === LEAD_IDS.C ? { ...l, stage: "Lost" } : l));
    const s = run(picked, { type: "refreshOk", view: view(leadsResult("ready", lost)), at: LATER });
    expect(ids(s)).not.toContain(LEAD_IDS.C);
    expect(selectedOf(s)).toBe(LEAD_IDS.A);
  });

  it("filters by base bucket with counts, and selects the first of the filter (AC7)", () => {
    expect(filterCounts(start)).toEqual({ all: 11, new: 2, due: 4, postTrial: 2, later: 3 });
    const post = run(start, { type: "setFilter", filter: "postTrial" });
    expect(ids(post)).toEqual([LEAD_IDS.E, LEAD_IDS.F]);
    expect(selectedOf(post)).toBe(LEAD_IDS.E);
    const due = run(start, { type: "setFilter", filter: "due" });
    expect(ids(due)).toEqual([LEAD_IDS.G, LEAD_IDS.D, LEAD_IDS.C, LEAD_IDS.H]);
  });

  it("moves with the keys, clamped, and keeps exactly one selected after every action (AC1, AC7)", () => {
    let s = start;
    const actions: SalesAction[] = [
      { type: "move", key: "ArrowUp" }, { type: "move", key: "ArrowDown" }, { type: "move", key: "End" }, { type: "move", key: "ArrowDown" },
      { type: "setFilter", filter: "new" }, { type: "move", key: "ArrowDown" }, { type: "setFilter", filter: "all" }, { type: "move", key: "Home" },
      { type: "refreshFailed", message: "x", at: LATER }, { type: "refreshOk", view: view(leadsResult("empty", [])), at: LATER },
    ];
    const seen: (string | null)[] = [];
    for (const a of actions) {
      s = salesReducer(s, a);
      selectedInvariant(s);
      seen.push(selectedOf(s));
    }
    expect(seen.slice(0, 4)).toEqual([LEAD_IDS.A, LEAD_IDS.B, LEAD_IDS.J, LEAD_IDS.J]);
    expect(seen[5]).toBe(LEAD_IDS.B);
    expect(seen.at(-1)).toBeNull();
    expect(retainedView(s).status).toBe("empty");
  });
});

describe("queueKeyTarget", () => {
  it("clamps without wrapping, with Home and End", () => {
    expect(queueKeyTarget("ArrowDown", 0, 3)).toBe(1);
    expect(queueKeyTarget("ArrowDown", 2, 3)).toBe(2);
    expect(queueKeyTarget("ArrowUp", 0, 3)).toBe(0);
    expect(queueKeyTarget("Home", 2, 3)).toBe(0);
    expect(queueKeyTarget("End", 0, 3)).toBe(2);
    expect(queueKeyTarget("Enter", 0, 3)).toBeNull();
    expect(queueKeyTarget("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("shouldRefreshOnSync", () => {
  it("records the first checkedAt and fires once per new one", () => {
    const ok = (checkedAt: string) => ({ kind: "ok" as const, checkedAt, lastGoodAt: checkedAt });
    let r = shouldRefreshOnSync(null, { kind: "checking", checkedAt: null, lastGoodAt: null });
    expect(r).toEqual({ refresh: false, seen: null });
    r = shouldRefreshOnSync(r.seen, ok("t1"));
    expect(r).toEqual({ refresh: false, seen: "t1" });
    r = shouldRefreshOnSync(r.seen, ok("t1"));
    expect(r.refresh).toBe(false);
    r = shouldRefreshOnSync(r.seen, { kind: "degraded", checkedAt: "t2", lastGoodAt: "t2" });
    expect(r).toEqual({ refresh: true, seen: "t2" });
    expect(shouldRefreshOnSync("t2", { kind: "unavailable", checkedAt: null, lastGoodAt: "t2" })).toEqual({ refresh: false, seen: "t2" });
  });
});

// REQ-62: a "Call now" deep link (?lead=) preselects that lead when it is in the queue.
describe("initialSalesState with a lead", () => {
  it("selects the lead, dashed or not, and falls back to the first item", () => {
    const v = view();
    const items = v.queue.data!.items;
    const second = items[1].id;
    expect(initialSalesState(v, second.replaceAll("-", "").toUpperCase()).selectedId).toBe(second);
    expect(initialSalesState(v, "ffffffff-0000-4000-8000-000000000999").selectedId).toBe(items[0].id);
    expect(initialSalesState(v).selectedId).toBe(items[0].id);
  });
});

// REQ-61 AC11: after a logged outcome the selection moves on.
describe("nextAfter", () => {
  it("picks the first visible lead other than the logged one", () => {
    const s = initialSalesState(view());
    const [first, second] = ids(s);
    expect(nextAfter(s, first)).toBe(second);
    expect(nextAfter(s, second)).toBe(first);
    const advanced = run(s, { type: "advance", loggedId: first });
    expect(selectedOf(advanced)).toBe(second);
    selectedInvariant(advanced);
  });

  it("keeps the logged lead when it is the only one, and is null for an empty queue", () => {
    const only = initialSalesState(view(leadsResult("ready", [fixtureLeads()[0]])));
    const [id] = ids(only);
    expect(nextAfter(only, id)).toBe(id);
    expect(nextAfter(initialSalesState(view(leadsResult("empty", []))), id)).toBeNull();
  });

  it("a logged lead that left the queue moves the selection to the first visible", () => {
    const s = initialSalesState(view());
    expect(nextAfter(s, "gone")).toBe(ids(s)[0]);
  });
});
