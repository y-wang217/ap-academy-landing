import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { notConnected, PANEL_STATUSES, type PanelStatus, type PanelView } from "../../../lib/console/panel-view";
import { Radar } from "./radar";

// REQ-55 AC6: the radar always has a text equivalent, and the sweep only turns over real data.
const STAGES = [
  { key: "new", label: "New", count: 3 },
  { key: "contacted", label: "Contacted", count: 2 },
  { key: "booked", label: "Call booked", count: 1 },
];
const NOW = new Date("2026-10-22T18:05:00.000Z");

function view(status: PanelStatus): PanelView<typeof STAGES> {
  if (status === "unverifiable") return notConnected("radar", NOW) as PanelView<typeof STAGES>;
  return {
    panel: "radar", status, data: STAGES, count: null, lastCheckedAt: NOW.toISOString(), lastSuccessfulFetchAt: NOW.toISOString(),
    staleReason: status === "stale" ? "Slow" : null, errorMessage: status === "error" ? "Down" : null, sourceEvidence: [],
  };
}
const render = (s: PanelStatus) => renderToStaticMarkup(h(Radar, { id: "radar", title: "Lead radar", emptyText: "No active leads", label: "Lead stages", result: view(s) }));

describe("Radar (AC6)", () => {
  it("labels the svg with every stage and count", () => {
    const out = render("ready");
    expect(out).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Lead stages: New 3, Contacted 2, Call booked 1"/);
  });

  it("has a visible table with the same stages and counts", () => {
    const out = render("ready");
    const rows = [...out.matchAll(/<tr><th scope="row">([^<]+)<\/th><td[^>]*>(\d+)<\/td><\/tr>/g)].map((m) => [m[1], Number(m[2])]);
    expect(rows).toEqual(STAGES.map((s) => [s.label, s.count]));
  });

  it.each(PANEL_STATUSES)("%s has the sweep only with data", (s) => {
    const out = render(s);
    const hasSweep = out.includes('class="console-sweep"');
    expect(hasSweep).toBe(s === "ready" || s === "stale");
    if (hasSweep) expect(out).toMatch(/<g class="console-sweep" aria-hidden="true"/);
  });

  it.each(["loading", "empty", "error", "unverifiable"] as const)("%s shows a static ring and no stage count", (s) => {
    const out = render(s);
    expect(out).toContain('data-radar-ring="idle"');
    expect(out).not.toContain("New 3");
  });
});
