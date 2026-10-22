import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { notConnected, PANEL_STATUSES, type PanelStatus, type PanelView } from "../../../lib/console/panel-view";
import { FreshnessLine } from "./freshness-line";
import { Gauge } from "./gauge";
import { InstrumentPanel } from "./instrument-panel";
import { Metric } from "./metric";
import { QueueList } from "./queue-row";
import { Radar } from "./radar";
import { StatusBadge } from "./status-badge";

// REQ-55 AC3, AC8, AC11, AC12: every kit component renders all six statuses from a PanelView, and never a
// value it was not given. Fixtures carry data in every status, so a component that ignores the status shows up.
const NOW = new Date("2026-10-22T18:05:00.000Z");
const CHECKED = "2026-10-22T18:05:00.000Z"; // 14:05 Toronto
const SUCCESS = "2026-10-22T17:50:00.000Z"; // 13:50 Toronto

function view<T>(status: PanelStatus, data: T): PanelView<T> {
  if (status === "unverifiable") return notConnected("p", NOW) as PanelView<T>;
  return {
    panel: "p",
    status,
    data,
    count: null,
    lastCheckedAt: CHECKED,
    lastSuccessfulFetchAt: status === "error" || status === "loading" ? null : SUCCESS,
    staleReason: status === "stale" ? "Source slow to answer" : null,
    errorMessage: status === "error" ? "Lead source timed out" : null,
    sourceEvidence: [],
  };
}

const frame = { id: "p", title: "Test panel", emptyText: "Nothing here", retryHref: "?mode=sales" };

type Case = { name: string; render: (status: PanelStatus) => ReactElement; shown: string };
const CASES: Case[] = [
  {
    name: "InstrumentPanel",
    render: (s) =>
      h(InstrumentPanel<{ text: string }>, { ...frame, result: view(s, { text: "Value 4321" }), children: (d: { text: string }) => h("span", { "data-panel-value": "" }, d.text) }),
    shown: "Value 4321",
  },
  { name: "Metric", render: (s) => h(Metric, { ...frame, result: view(s, { value: 4321, currency: "CAD" as const }) }), shown: "$4,321" },
  { name: "Gauge", render: (s) => h(Gauge, { ...frame, result: view(s, { value: 37, max: 59, unit: "h" }) }), shown: "37 of 59 h" },
  {
    name: "Radar",
    render: (s) => h(Radar, { ...frame, label: "Lead stages", result: view(s, [{ key: "new", label: "New", count: 7 }, { key: "trial", label: "Trial", count: 5 }]) }),
    shown: "New 7",
  },
  {
    name: "QueueList",
    render: (s) => h(QueueList, { ...frame, result: view(s, [{ id: "q1", title: "Lead Q", reason: "Call back", due: "16:45", href: "#lead-q" }]) }),
    shown: "Lead Q",
  },
];
const ROWS = CASES.flatMap((c) => PANEL_STATUSES.map((s) => [c.name, s, c] as const));
const html = (c: Case, s: PanelStatus) => renderToStaticMarkup(c.render(s));
const count = (src: string, needle: string) => src.split(needle).length - 1;

describe("kit components across the six statuses (AC3, AC8)", () => {
  it.each(ROWS)("%s %s is a focusable, labelled panel section (AC12)", (_n, s, c) => {
    const out = html(c, s);
    const section = out.match(/^<section[^>]*>/)?.[0] ?? "";
    expect(section).toContain('tabindex="0"');
    expect(section).toContain('data-panel="p"');
    const labelledBy = section.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(out).toMatch(new RegExp(`<h2[^>]*id="${labelledBy}"[^>]*>Test panel</h2>`));
  });

  it.each(CASES)("$name ready shows the value", (c) => {
    const out = html(c, "ready");
    expect(out).toContain("data-panel-value");
    expect(out).toContain(c.shown);
  });

  it.each(CASES)("$name empty shows only the empty text", (c) => {
    const out = html(c, "empty");
    expect(out).toContain("Nothing here");
    expect(out).not.toContain("data-panel-value");
    expect(out).not.toContain(c.shown);
  });

  it.each(CASES)("$name loading is busy, says Loading and shows no value", (c) => {
    const out = html(c, "loading");
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("Loading");
    expect(out).not.toContain("data-panel-value");
    expect(out).not.toContain(c.shown);
    expect(out).not.toMatch(/4,?321|37 of|59|>7<|16:45/);
  });

  it.each(CASES)("$name stale shows the value, the reason and the last success", (c) => {
    const out = html(c, "stale");
    expect(out).toContain(c.shown);
    expect(out).toContain("Source slow to answer");
    expect(out).toContain("Last success 13:50");
  });

  it.each(CASES)("$name error shows FailureState with a Retry link and no value", (c) => {
    const out = html(c, "error");
    expect(out).toContain("Cannot load Test panel");
    expect(out).toContain("Lead source timed out");
    expect(out).toContain("Last success never");
    expect(out).toMatch(/<a [^>]*href="\?mode=sales"[^>]*>Retry<\/a>/);
    expect(out).not.toContain("data-panel-value");
    expect(out).not.toContain(c.shown);
  });

  it.each(CASES)("$name unverifiable prints the reason verbatim and no value", (c) => {
    const out = html(c, "unverifiable");
    expect(count(out, "Not connected yet")).toBe(1);
    expect(out).not.toContain("data-panel-value");
    expect(out).not.toContain(c.shown);
  });

  it("prints a reason it was given, without rewording it", () => {
    const odd = { ...notConnected("p", NOW), staleReason: "Waiting for card 57" };
    const out = renderToStaticMarkup(h(InstrumentPanel, { ...frame, result: odd, children: () => null }));
    expect(out).toContain("Waiting for card 57");
    expect(out).not.toContain("Not connected yet");
  });

  it.each(PANEL_STATUSES)("Gauge never prints a percent (%s)", (s) => {
    expect(html(CASES[2], s)).not.toContain("%");
  });

  it.each(["Metric", "Gauge"])("%s readout uses tabular digits (AC11)", (name) => {
    const out = html(CASES.find((c) => c.name === name)!, "ready");
    const tag = out.match(/<[a-z]+ [^>]*data-panel-value[^>]*>/)?.[0] ?? "";
    expect(tag).toMatch(/class="[^"]*tabular-nums/);
  });

  it("only the primary panel gets the primary edge", () => {
    const plain = renderToStaticMarkup(h(Metric, { ...frame, result: view("ready", { value: 1 }) }));
    const primary = renderToStaticMarkup(h(QueueList, { ...frame, primary: true, result: view("ready", []) }));
    expect(plain).not.toContain("data-primary");
    expect(primary).toContain("data-primary");
  });
});

describe("QueueList rows", () => {
  it("marks the first row NEXT and links each row with a plain <a href>", () => {
    const items = [
      { id: "a", title: "Lead A", reason: "Trial follow-up", due: "16:45", href: "#lead-a" },
      { id: "b", title: "Lead B", reason: "Call back", href: "#lead-b" },
    ];
    const out = renderToStaticMarkup(h(QueueList, { ...frame, result: view("ready", items) }));
    expect(count(out, ">NEXT<")).toBe(1);
    expect(out.indexOf(">NEXT<")).toBeLessThan(out.indexOf("Lead B"));
    expect(out).toMatch(/<a [^>]*href="#lead-a"/);
    expect(out).toMatch(/<a [^>]*href="#lead-b"/);
    expect(out).not.toContain("<button");
  });

  it("an empty ready list is the empty text", () => {
    const out = renderToStaticMarkup(h(QueueList, { ...frame, result: view("ready", []) }));
    expect(out).toContain("Nothing here");
  });
});

describe("StatusBadge", () => {
  const LABELS: Record<PanelStatus, string> = { ready: "Current", empty: "Empty", loading: "Loading", stale: "Stale", error: "Error", unverifiable: "Unverified" };
  it.each(PANEL_STATUSES)("%s has a text label and a shape", (s) => {
    const out = renderToStaticMarkup(h(StatusBadge, { status: s }));
    expect(out).toContain(`>${LABELS[s]}<`);
    expect(out).toMatch(/data-shape="[a-z-]+"/);
  });

  it("each status has its own shape", () => {
    const shapes = PANEL_STATUSES.map((s) => renderToStaticMarkup(h(StatusBadge, { status: s })).match(/data-shape="([a-z-]+)"/)?.[1]);
    expect(new Set(shapes).size).toBe(PANEL_STATUSES.length);
  });
});

describe("FreshnessLine", () => {
  it("shows the check and the last success", () => {
    const out = renderToStaticMarkup(h(FreshnessLine, { result: view("ready", 1) }));
    expect(out).toContain("Checked 14:05");
    expect(out).toContain("Last success 13:50");
  });

  it("says when there has been no successful read", () => {
    const out = renderToStaticMarkup(h(FreshnessLine, { result: notConnected("p", NOW) }));
    expect(out).toContain("Checked 14:05");
    expect(out).toContain("No successful read yet");
  });
});
