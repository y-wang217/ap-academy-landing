import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fixtureLeads, lead, LEAD_IDS, SALES_NOW, TRIAL_F } from "../../../test/console/sales-fixtures";
import type { ConsolePanels, LeadRow, PanelResult, TouchGroup, TrialLessonRow } from "../../../lib/console/contracts";
import { buildSalesView, type SalesView } from "../../../lib/console/sales-view";
import { NextLead } from "./next-lead";
import { SalesProvider } from "./sales-provider";
import { SalesRadar } from "./sales-radar";

// REQ-57 AC1, AC4, AC5, AC7, AC8, AC9, AC10: the queue, the Rolodex and the radar, rendered from a seeded provider.
const AT = SALES_NOW.toISOString();
function result<T>(panel: string, status: PanelResult<T>["status"], data: T | null, extra: Partial<PanelResult<T>> = {}): PanelResult<T> {
  return {
    panel: panel as PanelResult<T>["panel"], status, data, count: null, lastCheckedAt: AT, lastSuccessfulFetchAt: status === "error" ? null : AT,
    staleReason: null, errorMessage: status === "error" ? "Timed out after 8 s" : null, sourceEvidence: [], ...extra,
  };
}
function salesView(
  leads: LeadRow[] = fixtureLeads(),
  { trials = [TRIAL_F] as TrialLessonRow[] | null, touches = [] as TouchGroup[] | null, leadStatus = "ready" as PanelResult<LeadRow[]>["status"], extra = {} } = {},
): SalesView {
  const panels = {
    leads: result("leads", leadStatus, leadStatus === "error" ? null : leads, extra),
    touches: touches === null ? result("touches", "error", null) : result("touches", "ready", touches),
    trialLessons: trials === null ? result("trialLessons", "error", null) : result("trialLessons", "ready", trials),
    work: result("work", "empty", []),
    invoices: result("invoices", "empty", []),
    people: result("people", "ready", { syncedAt: AT, students: 0, staff: 0 }),
  } as ConsolePanels;
  return buildSalesView(panels, SALES_NOW);
}
const frame = { id: "next", title: "Next contact", emptyText: "Queue clear", primary: true, retryHref: "?mode=sales" };
const render = (v: SalesView) => renderToStaticMarkup(h(SalesProvider, { initial: v }, h(NextLead, frame)));
const count = (src: string, needle: string) => src.split(needle).length - 1;
const rolodex = (out: string) => out.slice(out.indexOf("data-rolodex"));

describe("NextLead", () => {
  it("selects exactly one option, the first, with the NEXT tag (AC1)", () => {
    const out = render(salesView());
    expect(count(out, 'role="option"')).toBe(11);
    expect(count(out, 'aria-selected="true"')).toBe(1);
    expect(out).toMatch(new RegExp(`id="sales-lead-${LEAD_IDS.A}"[^>]*aria-selected="true"`));
    expect(count(out, "console-next-tag")).toBe(1);
    expect(out).toContain('role="listbox"');
    expect(out).toContain(`aria-activedescendant="sales-lead-${LEAD_IDS.A}"`);
  });

  it("shows the filters with counts and the exception line (AC7, AC10)", () => {
    const out = render(salesView());
    for (const label of ["All 11", "New 2", "Due 4", "Post-trial 2", "Later 3"]) expect(out).toContain(label);
    expect(out).toContain("3 exceptions");
    expect(out).toContain("1 duplicate row merged");
    expect(out).toContain('type="radio"');
    expect(render(salesView([lead("A", { stage: "New", nextActionDue: AT })]))).toContain("No exceptions");
  });

  it("Queue clear only for empty; error shows the kit failure (AC1, AC6)", () => {
    const empty = render(salesView([lead("O", { stage: "Active" })]));
    expect(empty).toContain("Queue clear");
    expect(count(empty, 'role="option"')).toBe(0);
    expect(empty).toContain("No exceptions");
    const error = render(salesView([], { leadStatus: "error" }));
    expect(error).toContain('data-status="error"');
    expect(error).not.toContain("Queue clear");
    expect(render(salesView())).not.toContain("Queue clear");
  });

  it("a truncated stale read with no items says Queue may be incomplete", () => {
    const out = render(salesView([], { leadStatus: "stale", extra: { staleReason: "Stopped after 10 pages; showing 0 rows" } }));
    expect(out).toContain("Queue may be incomplete");
    expect(out).not.toContain("Queue clear");
  });

  it("shows the Rolodex fields and fallbacks for the selected lead (AC8)", () => {
    const touch: TouchGroup = { studentId: LEAD_IDS.A, studentName: "Lead A", touches: [{ id: "t1", pageUrl: "https://www.notion.so/t1", when: "2026-10-21T15:00:00.000Z", whenDate: "2026-10-21", type: "Call", outcome: "No answer", studentId: LEAD_IDS.A, staffId: "s1", staffName: "Ryan Test", note: "Left a voicemail" }] };
    const out = rolodex(render(salesView([
      lead("A", { stage: "New", ownerStaffId: "s1", ownerName: "Ryan Test", grade: "11", subjects: ["MHF4U", "SPH4U"], attempts: 2, nextAction: "Call", nextActionDue: "2026-10-22T15:00:00.000Z", source: "Meta form", contactedAt: "2026-10-20" }),
    ], { touches: [touch] })));
    for (const s of ["Lead A", "11", "MHF4U, SPH4U", "New", "Ryan Test", "Call", "Thu 22 Oct 11:00", "2", "No answer", "Left a voicemail", "Meta form", "Tue 20 Oct"]) expect(out).toContain(s);
    const bare = rolodex(render(salesView([lead("A", { stage: "New" })], { touches: [] })));
    expect(bare).toContain("Unassigned");
    expect(bare).toContain("No touches in the last 90 days");
    const unknown = rolodex(render(salesView([lead("A", { stage: "New", ownerStaffId: "s9" })], { touches: null })));
    expect(unknown).toContain("Unknown staff");
    expect(unknown).toContain("Touch history unavailable");
  });

  it("shows the trial block from evidence only (AC4)", () => {
    const f = (over: Partial<LeadRow> = {}) => lead("F", { stage: "Trial Claimed", nextAction: "Close call", ...over });
    expect(rolodex(render(salesView([f()])))).toContain("Needs factoring practice");
    expect(rolodex(render(salesView([f()])))).toContain("Tue");
    expect(rolodex(render(salesView([f()], { trials: [{ ...TRIAL_F, diagnosis: null }] })))).toContain("No trial report yet");
    expect(rolodex(render(salesView([f({ level: "Solid" })], { trials: [] })))).toContain("No trial lesson logged");
    expect(rolodex(render(salesView([f({ level: "Solid" })], { trials: null })))).toContain("Trial lessons unavailable");
    const gaps = rolodex(render(salesView([f({ level: "Solid", majorGaps: null, trialSummary: null })])));
    expect(count(gaps, "No trial report yet")).toBe(2);
  });

  it("opens each same-name lead at its own page id (AC5)", () => {
    const one = lead("A", { stage: "New", name: "Same Name", nextActionDue: "2026-10-22T15:00:00.000Z" });
    const two = lead("B", { stage: "New", name: "Same Name" });
    const out = render(salesView([one, two]));
    expect(rolodex(out)).toContain(`href="${one.pageUrl}"`);
    expect(out).toContain(`data-href="${two.pageUrl}"`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("never renders a tel: link, a phone or a Lead ID (AC8)", () => {
    const out = render(salesView(fixtureLeads().map((l) => ({ ...l, dedupeKey: "lead-secret-77", parentName: "Pat" }))));
    expect(out).not.toMatch(/tel:|lead-secret-77|555-/);
  });
});

describe("SalesRadar (AC9)", () => {
  const radar = (v: SalesView) => renderToStaticMarkup(h(SalesProvider, { initial: v }, h(SalesRadar, { id: "radar", title: "Lead radar", emptyText: "No active leads", retryHref: "?mode=sales" })));

  it("has five rows with the bucket labels and counts", () => {
    const out = radar(salesView());
    for (const [label, n] of [["New", 2], ["Callback due", 1], ["Post-trial", 2], ["Follow-up due", 3], ["Later", 3]] as const) {
      expect(out).toContain(`<th scope="row">${label}</th><td class="tabular-nums">${n}</td>`);
    }
    expect(count(out, "console-sector ")).toBe(5);
  });

  it("No active leads only when nothing is eligible, and the error state on a failed read", () => {
    expect(radar(salesView([lead("O", { stage: "Active" })]))).toContain("No active leads");
    const error = radar(salesView([], { leadStatus: "error" }));
    expect(error).toContain('data-status="error"');
    expect(error).not.toContain("No active leads");
  });
});
