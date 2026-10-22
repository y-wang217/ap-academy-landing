import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FunnelPanelData } from "../../lib/console/finance-panels";
import { PANEL_STATUSES, type PanelStatus, type PanelView } from "../../lib/console/panel-view";
import type { FunnelCount, FunnelRef } from "../../lib/console/trial-funnel";
import { TrialFunnelPanel } from "./trial-funnel";

// REQ-59 AC5, AC7, AC8: the funnel panel in every status and both variants.
const NOW = "2026-10-22T16:00:00.000Z";
const LEADS_URL = "https://www.notion.so/leadsds";
const refs = (n: number, label: string | null = null): FunnelRef[] => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, name: `Lead ${i}`, date: "2026-10-01", href: `https://www.notion.so/l${i}`, label }));
const ok = (n: number): FunnelCount => ({ state: "ok", count: n, rows: refs(n) });
const DATA: FunnelPanelData = {
  window: { days: 30, from: "2026-09-23", to: "2026-10-22" },
  booked: ok(5), delivered: ok(3), closed: ok(2), verified: ok(1), outcomeUnknown: ok(1),
  links: { label: "Last 30 days, Wed 23 Sep to Thu 22 Oct", others: [{ days: 7, href: "?mode=operations&window=7" }, { days: 90, href: "?mode=operations&window=90" }], operations: "?mode=operations&window=30" },
};
const view = (status: PanelStatus, data: FunnelPanelData | null = DATA): PanelView<FunnelPanelData> => ({
  panel: "trialFunnel", status, data, count: 5, lastCheckedAt: NOW, lastSuccessfulFetchAt: NOW,
  staleReason: status === "stale" ? "Payment records unavailable: verified enrolments unverifiable" : status === "unverifiable" ? "Trial records unavailable: Notion returned 500" : null,
  errorMessage: status === "error" ? "Read failed" : null,
  sourceEvidence: [{ source: "notion", sourceId: "leadsds", sourceUrl: LEADS_URL, observedAt: NOW }],
});
const render = (v: PanelView<FunnelPanelData>, variant: "full" | "headline" = "full") =>
  renderToStaticMarkup(h(TrialFunnelPanel, { id: "trials", title: "Trials", emptyText: "No trials in this period", result: v, variant }));

describe.each(["full", "headline"] as const)("TrialFunnelPanel %s", (variant) => {
  it.each(PANEL_STATUSES)("%s shows the Students & Parents link and no percentage", (status) => {
    const out = render(view(status, status === "ready" || status === "stale" || status === "empty" ? DATA : null), variant);
    expect(out).toContain(`data-status="${status}"`);
    expect(out).toContain(`href="${LEADS_URL}"`);
    expect(out).not.toContain("%");
  });
});

describe("TrialFunnelPanel full", () => {
  it("prints the five counts as details lists and the three ratio lines", () => {
    const out = render(view("ready"));
    for (const label of ["Booked", "Delivered", "Closed", "Verified enrolments", "Outcome unknown"]) expect(out).toContain(`data-funnel-count="${label}"`);
    expect(out).toContain("<details");
    expect(out).toContain("Delivered 3 of 5 booked");
    expect(out).toContain("Closed 2 of 3 delivered");
    expect(out).toContain("Verified 1 of 2 closed");
    expect(out).toContain('href="?mode=operations&amp;window=7"');
  });

  it("an unverifiable count prints Unverifiable with its reason, never a digit, and drops its ratio", () => {
    const out = render(view("stale", { ...DATA, verified: { state: "unverifiable", reason: "Payment records unavailable" } }));
    const verified = out.slice(out.indexOf('data-funnel-count="Verified enrolments"'), out.indexOf('data-funnel-count="Outcome unknown"'));
    expect(verified).toContain("Unverifiable");
    expect(verified).not.toMatch(/\d/);
    expect(out).not.toContain("Verified 1 of");
    expect(out).toContain("Closed 2 of 3 delivered");
  });

  it("no ratio when the denominator is 0", () => {
    const out = render(view("ready", { ...DATA, booked: ok(0), delivered: ok(0) }));
    expect(out).not.toContain("of 0");
  });

  it("caps a list at 25 rows with an N more in Notion link", () => {
    const out = render(view("ready", { ...DATA, booked: { state: "ok", count: 30, rows: refs(30) } }));
    const booked = out.slice(out.indexOf('data-funnel-count="Booked"'), out.indexOf('data-funnel-count="Delivered"'));
    expect(booked.split("<li>").length - 1).toBe(26);
    expect(booked).toContain("5 more in Notion");
  });
});

describe("TrialFunnelPanel headline", () => {
  it("shows the counts and links to Operations with the same window", () => {
    const out = render(view("ready"), "headline");
    expect(out).toContain("5 booked, 3 delivered, 2 closed, 1 verified");
    expect(out).toContain('href="?mode=operations&amp;window=30"');
    expect(out).not.toContain("<details");
  });
  it("an unverifiable count reads unverifiable", () => {
    expect(render(view("stale", { ...DATA, verified: { state: "unverifiable", reason: "x" } }), "headline")).toContain("verified unverifiable");
  });
});
