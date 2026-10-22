import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONSOLE_MODES, MODE_LABELS, type ConsoleMode } from "../../../lib/console/modes";
import { PANEL_SLOTS, placeholderPanels, slotsFor } from "../../../lib/console/panel-slots";
import type { ConsolePanels as ConsolePanelResults } from "../../../lib/console/contracts";
import { buildSalesView } from "../../../lib/console/sales-view";
import { fixtureLeads, SALES_NOW, TRIAL_F } from "../../../test/console/sales-fixtures";
import { ConsoleBridge } from "./bridge";

// REQ-55 AC1, AC2, AC8, AC9: the production bridge, every panel a "Not connected yet" placeholder.
const NOW = new Date("2026-10-22T18:05:00.000Z");
const render = (mode: ConsoleMode) => renderToStaticMarkup(h(ConsoleBridge, { mode, panels: placeholderPanels(NOW), email: "owner@example.com", now: NOW }));
const count = (src: string, needle: string) => src.split(needle).length - 1;
const tabpanel = (out: string, mode: ConsoleMode) => {
  const start = out.indexOf(`data-mode-panel="${mode}"`);
  const ends = [...CONSOLE_MODES.map((m) => out.indexOf(`data-mode-panel="${m}"`, start + 1)), out.indexOf("data-rail", start)].filter((i) => i > start);
  return out.slice(out.lastIndexOf("<", start), Math.min(...ends));
};
const indicator = (out: string, key: string) => out.match(new RegExp(`data-indicator="${key}"[^]*?data-indicator-value="">(.*?)</span></li>`))?.[1];
const TOTALS: Record<ConsoleMode, number> = { sales: 9, creation: 4, operations: 5 };

describe("panel slots", () => {
  it("Sales is in the AC12 order, next first", () => {
    expect(slotsFor("sales").map((s) => s.id)).toEqual(["next", "northStar", "signals", "followUps", "radar", "conversion", "capacity", "cashflow", "dispatch"]);
  });

  it.each(CONSOLE_MODES)("%s has its slot count", (mode) => {
    expect(slotsFor(mode)).toHaveLength(TOTALS[mode]);
  });

  it("only NEXT is primary, and each slot's area is its id", () => {
    expect(PANEL_SLOTS.filter((s) => s.primary).map((s) => s.id)).toEqual(["next"]);
    for (const s of PANEL_SLOTS) expect(s.area).toBe(s.id);
  });
});

describe.each(CONSOLE_MODES)("ConsoleBridge, %s", (mode) => {
  const out = render(mode);

  it("is the bridge (AC1)", () => {
    expect(out).toContain("data-console");
    expect(out).toContain("AP ACADEMY // FOUNDER CONSOLE");
    expect(out).toContain("data-horizon");
    const horizon = out.slice(out.indexOf("data-horizon"), out.indexOf("</svg>", out.indexOf("data-horizon")));
    expect(horizon).toContain("<rect");
    expect(horizon).not.toContain("<text");
  });

  it("has the tablist with the chosen tab selected (AC2)", () => {
    expect(count(out, 'role="tablist"')).toBe(1);
    const tabs = [...out.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)];
    expect(tabs.map((t) => t[1])).toEqual(["Sales", "Creation", "Operations"]);
    for (const [tag, label] of tabs) {
      const chosen = label === MODE_LABELS[mode];
      expect(tag).toContain(`aria-selected="${chosen}"`);
      expect(tag).toContain(`tabindex="${chosen ? 0 : -1}"`);
      expect(tag).toMatch(/aria-controls="console-panel-(sales|creation|operations)"/);
    }
  });

  it("shows only the chosen tabpanel", () => {
    for (const m of CONSOLE_MODES) {
      const open = out.match(new RegExp(`<div[^>]*data-mode-panel="${m}"[^>]*>`))?.[0] ?? "";
      expect(open).toContain('role="tabpanel"');
      expect(open).toContain(`id="console-panel-${m}"`);
      expect(open.includes("hidden")).toBe(m !== mode);
    }
  });

  it("every production panel is Not connected yet, with no value (AC8)", () => {
    for (const m of CONSOLE_MODES) {
      const panel = tabpanel(out, m);
      expect(count(panel, "data-panel=")).toBe(TOTALS[m]);
      expect(count(panel, "Not connected yet")).toBe(TOTALS[m]);
    }
    expect(count(out, "Not connected yet")).toBe(18);
    expect(out).not.toContain("data-panel-value");
  });

  it("has five real indicators and the shortcuts help (AC9)", () => {
    expect(count(out, "data-indicator=")).toBe(5);
    expect(indicator(out, "sources")).toBe("Checking sources");
    expect(indicator(out, "access")).toBe("Owner verified");
    expect(indicator(out, "panels")).toBe(`0 of ${TOTALS[mode]} connected`);
    expect(indicator(out, "motion")).toBe('<span class="console-motion-on">Motion on</span><span class="console-motion-reduced">Reduced motion</span>');
    expect(indicator(out, "mode")).toBe(MODE_LABELS[mode]);
    expect(out).toContain("Keyboard shortcuts");
  });

  it("never says online and has no decorative buttons", () => {
    expect(out).not.toMatch(/\bonline\b/i);
    for (const b of out.matchAll(/<button[^>]*>(.*?)<\/button>/g)) expect(b[1]).toMatch(/^(Sales|Creation|Operations|Sign out)$/);
  });
});

describe("ConsoleBridge focus order (AC12)", () => {
  it("the Sales tabpanel's panels are in slot order", () => {
    const ids = [...tabpanel(render("sales"), "sales").matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(slotsFor("sales").map((s) => s.id));
  });

  it("heading ids are unique across the three tabpanels", () => {
    const ids = [...render("sales").matchAll(/<h2[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// REQ-57: with a sales view, the Sales next and radar slots are the live queue and radar.
describe("ConsoleBridge with a sales view", () => {
  const view = buildSalesView(salesPanels(), SALES_NOW);
  const panels = placeholderPanels(NOW);
  panels.sales.next = view.queue;
  panels.sales.radar = view.radar;
  const out = renderToStaticMarkup(h(ConsoleBridge, { mode: "sales", panels, sales: view, email: "owner@example.com", now: NOW }));

  it("renders the queue, the Rolodex and the bucket radar in their slots", () => {
    const sales = tabpanel(out, "sales");
    expect(sales).toContain('role="listbox"');
    expect(sales).toContain("data-rolodex");
    expect(sales).toContain("Callback due");
    expect(count(sales, "Not connected yet")).toBe(7);
  });

  it("the rail counts 2 of 9 connected", () => {
    expect(indicator(out, "panels")).toBe("2 of 9 connected");
  });

  it("without a sales view nothing changes", () => {
    const plain = renderToStaticMarkup(h(ConsoleBridge, { mode: "sales", panels: placeholderPanels(NOW), now: NOW }));
    expect(plain).not.toContain('role="listbox"');
    expect(count(tabpanel(plain, "sales"), "Not connected yet")).toBe(9);
  });
});

function salesPanels(): ConsolePanelResults {
  const at = SALES_NOW.toISOString();
  const r = <T,>(panel: string, status: "ready" | "empty", data: T) => ({
    panel, status, data, count: null, lastCheckedAt: at, lastSuccessfulFetchAt: at, staleReason: null, errorMessage: null, sourceEvidence: [],
  });
  return {
    leads: r("leads", "ready", fixtureLeads()), touches: r("touches", "empty", []), trialLessons: r("trialLessons", "ready", [TRIAL_F]),
    work: r("work", "empty", []), invoices: r("invoices", "empty", []), people: r("people", "ready", { syncedAt: at, students: 0, staff: 0 }),
  } as ConsolePanelResults;
}

// REQ-56 AC5: the northStar slot renders the north-star instrument; the other slots are unchanged.
describe("the north-star slot", () => {
  const view = {
    panel: "northStar", status: "error" as const, data: null, count: null, lastCheckedAt: NOW.toISOString(), lastSuccessfulFetchAt: null,
    staleReason: null, errorMessage: "Cannot verify weekly hours", sourceEvidence: [],
  };
  it("renders NorthStar for northStar and leaves the rest Not connected yet", () => {
    const panels = placeholderPanels(NOW);
    panels.sales.northStar = view;
    const out = renderToStaticMarkup(h(ConsoleBridge, { mode: "sales", panels, now: NOW }));
    const north = out.slice(out.indexOf('data-panel="northStar"'), out.indexOf('data-panel="signals"'));
    expect(north).toContain("data-north-star");
    expect(north).toContain("Cannot verify weekly hours");
    expect(count(tabpanel(out, "sales"), "Not connected yet")).toBe(8);
  });
});
