import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { placeholderPanels } from "../../../lib/console/panel-slots";
import { HEALTH_KEYS, HEALTH_LABELS, NOT_CHECKED, type HealthEntry, type Signal, type SignalsView } from "../../../lib/console/signals";
import { ConsoleBridge } from "../shell/bridge";
import { HealthPanel, HealthRail } from "./health-rail";
import { SignalList } from "./signal-list";
import { SignalsProvider } from "./signals-provider";

// REQ-62 AC2, AC3, AC6, AC7: the signals list, the health rail and the band in the bridge.
const NOW = new Date("2026-10-22T18:00:00.000Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const health = (over: Partial<Record<(typeof HEALTH_KEYS)[number], Partial<HealthEntry>>> = {}): HealthEntry[] =>
  HEALTH_KEYS.map((key) => ({ key, label: HEALTH_LABELS[key], status: "ready", lastCheckedAt: at(0), lastSuccessfulFetchAt: at(0), staleReason: null, errorMessage: null, ...over[key] }));
const signal = (kind: Signal["kind"], n: number, over: Partial<Signal> = {}): Signal => ({
  signalKey: `${kind}:${n}`, kind, title: `Title ${n}`, detail: `Detail ${n}`, sourceLabel: "Students & Parents", sourceUrl: `https://www.notion.so/p${n}`,
  checkedAt: at(-1), createdAt: kind === "fresh_lead" ? at(-30) : null, action: { label: "Open in Sales", href: `?mode=sales&lead=p${n}` }, ...over,
});
const OK_CHECKS: SignalsView["checks"] = ["fresh_lead", "followup_overdue", "trial_undecided", "lesson_gap", "people_stale", "outbox_failed"].map((kind) => ({ kind, state: "ok" }) as SignalsView["checks"][number]);
const viewOf = (over: Partial<SignalsView> = {}): SignalsView => ({ checkedAt: at(0), signals: [], checks: OK_CHECKS, health: health(), protectedTime: { state: "free" }, ...over });
const FRAME = { id: "signals", title: "Signals", emptyText: "No exceptions found" };
const list = (v: SignalsView) => renderToStaticMarkup(h(SignalsProvider, { initial: v, orgId: "org" }, h(SignalList, FRAME)));
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("SignalList", () => {
  it("reads No exceptions found only when every check is ok", () => {
    const out = list(viewOf());
    expect(out).toContain("No exceptions found");
    expect(out).not.toContain("Some checks failed");
  });

  it("reads Some checks failed, naming the kinds, when any check is not ok, even with no rows", () => {
    const out = list(viewOf({ checks: OK_CHECKS.map((c) => (c.kind === "lesson_gap" || c.kind === "fresh_lead" ? { ...c, state: "skipped" } : c)) }));
    expect(out).toContain("Some checks failed");
    expect(out).toContain("Some checks failed: Fresh lead, Missing lesson log");
    expect(out).not.toContain("No exceptions found");
  });

  it("groups exceptions by kind; each row has its source link, check time, one action, Dismiss and Snooze; fresh leads stay in the band", () => {
    const out = list(viewOf({ signals: [signal("fresh_lead", 1), signal("followup_overdue", 2), signal("provider_failure", 3, { sourceLabel: "Notion leads", action: { label: "Open source", href: "https://www.notion.so/src" } })] }));
    expect(out).not.toContain('data-signal="fresh_lead:1"');
    expect(out).toContain("Follow-up overdue (1)");
    expect(out).toContain("Provider failure (1)");
    expect(out.indexOf("Follow-up overdue (1)")).toBeLessThan(out.indexOf("Provider failure (1)"));
    expect(out).toContain('<a href="https://www.notion.so/p2">Students &amp; Parents</a>');
    expect(out).toMatch(/, checked \d\d:\d\d/);
    expect(count(out, ">Dismiss</button>")).toBe(2);
    expect(count(out, "data-snooze")).toBe(2);
    expect(out).toContain('href="?mode=sales&amp;lead=p2">Open in Sales</a>');
  });
});

describe("HealthRail", () => {
  const rail = (v: SignalsView) => renderToStaticMarkup(h(SignalsProvider, { initial: v, orgId: "org" }, h(HealthRail)));

  it("renders seven entries in order, Not checked for a provider with no read, the reason in text on error", () => {
    const out = rail(viewOf({ health: health({
      notionLessons: { status: "error", errorMessage: "Timed out after 8 s", lastSuccessfulFetchAt: at(-20) },
      schedulerTables: { status: "unverifiable", staleReason: NOT_CHECKED, lastCheckedAt: null, lastSuccessfulFetchAt: null },
      outbox: { status: "stale", staleReason: "2 failed exports" },
    }) }));
    expect([...out.matchAll(/data-health="([^"]+)"/g)].map((m) => m[1])).toEqual([...HEALTH_KEYS]);
    expect(out).toContain('data-health="notionLessons" data-status="error"');
    expect(out).toContain("Timed out after 8 s");
    expect(out).toContain('<span data-health-status="">error</span>');
    expect(out).toContain(`<span data-health-status="">${NOT_CHECKED}</span>`);
    expect(out).toContain("2 failed exports");
    expect(count(out, '<span data-health-status="">ok</span>')).toBe(4);
  });

  it("renders nothing without a signals view", () => {
    expect(renderToStaticMarkup(h(HealthRail))).toBe("");
  });

  it("the integrations panel is stale while a provider is not ok", () => {
    const out = renderToStaticMarkup(h(SignalsProvider, { initial: viewOf({ health: health({ notionLeads: { status: "error", errorMessage: "x" } }) }), orgId: "org" },
      h(HealthPanel, { id: "integrations", title: "Integration health", emptyText: "No checks run yet" })));
    expect(out).toContain('data-status="stale"');
    expect(out).toContain("Not ok: Notion leads");
  });
});

describe("ConsoleBridge with signals", () => {
  const bridge = (v: SignalsView) => renderToStaticMarkup(h(ConsoleBridge, { mode: "sales", panels: placeholderPanels(NOW), now: NOW, signals: v, orgId: "org" }));

  it("adds the band, the quiet toggle, Polling, not live and the rail's health strip", () => {
    const out = bridge(viewOf({ signals: [signal("fresh_lead", 1, { title: "Nova New" })] }));
    expect(out).toContain("Polling, not live");
    expect(out).toContain('data-signal-band=""');
    expect(out).toContain('data-signal="fresh_lead:1"');
    expect(out).toContain(">NEW</span>");
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('data-health-rail=""');
    expect(out).toContain("0 deferred");
    expect(out).toContain('aria-live="assertive"');
    expect(out).not.toContain("data-pulse");
    expect(count(out, 'data-panel="signals"')).toBe(3);
  });

  it("while teaching there is no assertive region and the header says until when", () => {
    const out = bridge(viewOf({ signals: [signal("fresh_lead", 1)], protectedTime: { state: "teaching", until: at(30), title: "MHF4U class" } }));
    expect(out).not.toContain('aria-live="assertive"');
    expect(out).toMatch(/Teaching until \d\d:\d\d/);
    expect(out).toContain('data-protected=""');
  });

  it("an owner with no staff link is told why teaching time is unknown", () => {
    expect(bridge(viewOf({ protectedTime: { state: "unknown", reason: "Owner has no staff link" } }))).toContain("Teaching time unknown: Owner has no staff link");
  });

  it("without a signals view nothing of it renders", () => {
    const out = renderToStaticMarkup(h(ConsoleBridge, { mode: "sales", panels: placeholderPanels(NOW), now: NOW }));
    expect(out).not.toContain("data-signal-band");
    expect(out).not.toContain("data-quiet");
    expect(out).not.toContain("data-health-rail");
  });
});
