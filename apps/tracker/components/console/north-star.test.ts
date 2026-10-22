import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SeriesFact } from "../../lib/domain/schedule/net-new";
import { weekOf } from "../../lib/domain/schedule/week";
import type { ConsolePanels, InvoiceRow, PanelResult, PanelStatus } from "../../lib/console/contracts";
import { buildNorthStar, type NorthStarData, type NorthStarInput } from "../../lib/console/north-star";
import type { PanelView } from "../../lib/console/panel-view";
import { NorthStar } from "./north-star";

// REQ-56 AC4, AC5, AC6 (T3): the north-star instrument in every variant.
const NOW = new Date("2026-10-22T16:00:00.000Z");
const S1 = "a0000000-0000-4000-8000-000000000001";
const S2 = "a0000000-0000-4000-8000-000000000002";
const NOT_ADOPTED = "a0000000-0000-4000-8000-000000000003";
const STAFF = "b0000000-0000-4000-8000-000000000001";
const frame = { id: "northStar", title: "North star", emptyText: "No verified change this week", retryHref: "?mode=sales" };

const result = <T,>(panel: PanelResult<T>["panel"], status: PanelStatus, data: T | null): PanelResult<T> => ({
  panel, status, data, count: null, lastCheckedAt: NOW.toISOString(), lastSuccessfulFetchAt: status === "error" ? null : NOW.toISOString(),
  staleReason: null, errorMessage: status === "error" ? "Timed out after 8 s" : null, sourceEvidence: [],
});
const paid = (id: string): InvoiceRow => ({
  id: `inv-${id}`, pageUrl: "u", status: "Paid", paidOn: "2026-10-01", amount: 1, creditApplied: null, issued: null, due: null, month: "2026-10", studentIds: [id], studentName: null,
});
const panels = (invoices: PanelResult<InvoiceRow[]>): ConsolePanels => ({
  leads: result("leads", "ready", []), touches: result("touches", "ready", []), trialLessons: result("trialLessons", "ready", []), work: result("work", "ready", []),
  invoices, people: result("people", "ready", { syncedAt: null, students: 1, staff: 1 }),
});
let n = 0;
const series = (over: Partial<SeriesFact> = {}): SeriesFact => ({
  id: `c0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, studentId: S1, staffId: STAFF, kind: "weekly", purpose: null, startDate: "2026-10-21",
  effectiveUntil: null, durationMinutes: 60, splitFrom: null, createdAt: "2026-10-21T15:00:00Z", ...over,
});
const ROWS = [
  series(), // verified addition
  series({ studentId: S2, startDate: "2026-09-01", effectiveUntil: "2026-10-20" }), // unverified (unpaid) reduction
  series({ kind: "one_off", purpose: "trial" }), // excluded trial
  series({ studentId: NOT_ADOPTED }), // excluded not in scheduler
];

function build(over: Partial<NorthStarInput> = {}, rows: SeriesFact[] = ROWS): PanelView<NorthStarData> {
  return buildNorthStar({
    week: weekOf("2026-10-22"), now: NOW, panels: panels(result("invoices", "ready", [paid(S1)])),
    people: { ok: true, value: { students: [{ id: S1, name: "Sam R.", stage: "Active", active: true }, { id: S2, name: "Lee K.", stage: "Active", active: true }], staff: [], syncedAt: NOW.toISOString() } },
    series: { ok: true, value: { series: rows, adoptions: [S1, S2].map((studentId) => ({ studentId, adoptedAt: "2026-09-01T10:00:00Z" })) } },
    ...over,
  });
}
const render = (view: PanelView<NorthStarData>) => renderToStaticMarkup(h(NorthStar, { ...frame, result: view }));
const rows = (out: string) => out.split("data-north-row=").length - 1;

describe("NorthStar", () => {
  it("verified: the value, week, opening, unverified net and diagnostics", () => {
    const out = render(build());
    expect(out).toContain('data-status="ready"');
    expect(out).toMatch(/data-panel-value="">\+1 h</);
    expect(out).toContain("net new verified hours, Mon 19 Oct to Sun 25 Oct");
    expect(out).toContain("Unverified net -1 h (not counted)");
    expect(out).toContain("Leads awaiting first contact 0");
    expect(out).toContain("Booked 3 h (unclassified)");
    expect(out).toContain('href="?mode=sales&amp;week=2026-10-12"');
    expect(out).not.toContain("Next week");
  });

  it("detail view: one row per counted and excluded series, with series and student links (AC5)", () => {
    const view = build();
    const out = render(view);
    expect(out).toContain("<details");
    expect(out).toContain("<summary>Show 2 counted, 2 excluded</summary>");
    expect(rows(out)).toBe(view.data!.current.counted.length + view.data!.current.excluded.length);
    expect(out).toContain(`href="/tracker/schedule?date=2026-10-21&amp;staffId=${STAFF}"`);
    expect(out).toContain(`href="https://www.notion.so/${S1.replaceAll("-", "")}"`);
    expect(out).toContain("Sam R.");
    expect(out).toContain("Unknown student");
    expect(out).toContain("unverified: unpaid");
    expect(out).toContain("excluded: trial");
    expect(out).toContain("excluded: not in scheduler");
    expect(out).toContain("Not in scheduler: 1 student");
  });

  it("unverifiable: the reason, the week, a retry, gross unclassified, never a verified figure (AC4)", () => {
    const out = render(build({ panels: panels(result("invoices", "error", null)) }));
    expect(out).toContain('data-status="unverifiable"');
    expect(out).toContain("Cannot verify weekly hours");
    expect(out).toContain("Timed out after 8 s");
    expect(out).toContain("Mon 19 Oct to Sun 25 Oct");
    expect(out).toContain('href="?mode=sales&amp;week=2026-10-19">Retry</a>');
    expect(out).toContain("Gross +1 h, -1 h (unclassified)");
    expect(out).not.toContain("data-panel-value");
    expect(out).not.toContain("net new verified");
    expect(out).not.toContain("0 h");
    expect(out).not.toContain("%");
    expect(rows(out)).toBe(4);
  });

  it("stale (incomplete): the value and the reason", () => {
    const view = build({ people: { ok: true, value: { students: [{ id: S1, name: "Sam R.", stage: "Active", active: true }], staff: [], syncedAt: null } } });
    const out = render(view);
    expect(out).toContain('data-status="stale"');
    expect(out).toContain("Student stages never synced; figures may be incomplete");
    expect(out).toContain("data-panel-value");
  });

  it("empty: the empty text and the week links", () => {
    const out = render(build({}, []));
    expect(out).toContain('data-status="empty"');
    expect(out).toContain("No verified change this week");
    expect(out).toContain("Previous week");
  });

  it("error: the failure state and no figure", () => {
    const out = render(build({ series: { ok: false } }));
    expect(out).toContain('data-status="error"');
    expect(out).toContain("Cannot verify weekly hours");
    expect(out).toContain(">Retry</a>");
    expect(out).not.toContain("0 h");
  });

  it("loading: a skeleton and no figure", () => {
    const view = { ...build(), status: "loading" as const, data: null };
    const out = render(view);
    expect(out).toContain('aria-busy="true"');
    expect(out).not.toContain("0 h");
    expect(out).not.toContain("data-panel-value");
  });

  it("a percentage only with a verified non-zero prior week (AC6)", () => {
    expect(render(build({}, [series({ startDate: "2026-10-14" }), series({ durationMinutes: 90 })]))).toContain("vs last week +0.5 h (+50%)");
    const zeroPrior = render(build({}, [series({ durationMinutes: 90 })]));
    expect(zeroPrior).toContain("vs last week +1.5 h");
    expect(zeroPrior).not.toContain("%");
    expect(render(build({ panels: panels(result("invoices", "error", null)) }))).not.toContain("vs last week");
  });
});
