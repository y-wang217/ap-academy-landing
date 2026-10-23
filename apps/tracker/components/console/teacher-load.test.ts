import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TeacherLoadData } from "../../lib/console/operations";
import { PANEL_STATUSES, type PanelStatus, type PanelView } from "../../lib/console/panel-view";
import type { WeekLoad } from "../../lib/domain/schedule/operations";
import { TeacherLoad } from "./teacher-load";

// REQ-58 AC1, AC2, AC5: the teacher load panel in every status, and never a figure it was not given.
const NOW = "2026-10-22T20:00:00.000Z";
const week = (w: Partial<WeekLoad>): WeekLoad => ({
  from: "2026-10-19", to: "2026-10-25", scheduledMinutes: 720, deliveredMinutes: 360, availability: "entered", availableMinutes: 1200, insideMinutes: 720,
  outsideMinutes: 0, utilisation: 0.6, ...w,
});
const row = (name: string, weeks: [WeekLoad, WeekLoad], notTeaching = false) => ({ staffId: `id-${name}`, name, notTeaching, weeks, availabilityHref: `/tracker/schedule/availability?staffId=id-${name}` });
const DATA: TeacherLoadData = {
  weeks: [{ from: "2026-10-19", to: "2026-10-25", label: "Mon 19 Oct to Sun 25 Oct" }, { from: "2026-10-26", to: "2026-11-01", label: "Mon 26 Oct to Sun 1 Nov" }],
  scheduleHref: "/tracker/schedule",
  conflictsHref: "/tracker/schedule/conflicts",
  rows: [
    row("Ryan M.", [week({}), week({ scheduledMinutes: 600, deliveredMinutes: null, insideMinutes: 600, utilisation: 0.5 })]),
    row("Ana P.", [week({ scheduledMinutes: 240, deliveredMinutes: 120, availability: "not_entered", availableMinutes: null, insideMinutes: null, utilisation: null }), week({ deliveredMinutes: null, availability: "not_entered", availableMinutes: null, insideMinutes: null, utilisation: null })]),
    row("Lee K.", [week({ scheduledMinutes: 60, deliveredMinutes: 0, availableMinutes: 0, insideMinutes: 0, outsideMinutes: 60, utilisation: null }), week({ scheduledMinutes: 0, deliveredMinutes: null, availableMinutes: 0, insideMinutes: 0, utilisation: null })], true),
  ],
};
const CANONICAL = { href: "/tracker/schedule", label: "Open schedule" };
const view = (status: PanelStatus, data: TeacherLoadData | null = DATA, extra: Partial<PanelView<TeacherLoadData>> = {}): PanelView<TeacherLoadData> => ({
  panel: "teacherLoad", status, data, count: null, lastCheckedAt: NOW, lastSuccessfulFetchAt: NOW, staleReason: status === "stale" || status === "unverifiable" ? "Teacher roster unavailable" : null,
  errorMessage: status === "error" ? "Read failed" : null, sourceEvidence: [], ...extra,
});
const render = (v: PanelView<TeacherLoadData>) => renderToStaticMarkup(h(TeacherLoad, { id: "teacherLoad", title: "Teacher load", emptyText: "No teachers active", canonical: CANONICAL, result: v }));

describe("TeacherLoad", () => {
  it.each(PANEL_STATUSES)("%s keeps the canonical link in the header", (status) => {
    const out = render(view(status));
    expect(out).toContain(`data-status="${status}"`);
    expect(out).toMatch(/<a href="\/tracker\/schedule" class="console-canonical"[^>]*>Open schedule<\/a>/);
    if (status === "ready" || status === "stale") expect(out).toContain("console-load");
    else expect(out).not.toContain("console-load\"");
  });

  it("shows scheduled and delivered apart, X of Y h (P%) and the next week without delivered", () => {
    const out = render(view("ready"));
    expect(out).toContain("12 h scheduled, 6 h delivered");
    expect(out).toContain("12 of 20 h (60%)");
    expect(out).toContain("10 h scheduled");
    expect(out).toContain("10 of 20 h (50%)");
    expect(out).toContain("Mon 19 Oct to Sun 25 Oct");
  });

  it("availability not entered has no percentage and links to the teacher's availability", () => {
    const ana = render(view("ready")).split('data-teacher="id-Ana P."')[1].split("</tr>")[0];
    expect(ana).toContain("availability not entered");
    expect(ana).toContain('href="/tracker/schedule/availability?staffId=id-Ana P."');
    expect(ana).not.toContain("%");
  });

  it("0 h available has no percentage; classes outside availability link to conflicts; the flag shows", () => {
    const lee = render(view("ready")).split('data-teacher="id-Lee K."')[1].split("</tr>")[0];
    expect(lee).toContain("0 h available");
    expect(lee).not.toContain("%");
    expect(lee).toContain("1 h outside availability");
    expect(lee).toContain('href="/tracker/schedule/conflicts"');
    expect(lee).toContain("Not active teaching staff");
  });

  it("unknown delivered and unknown availability never read as 0", () => {
    const unknown: TeacherLoadData = { ...DATA, rows: [row("Ryan M.", [week({ deliveredMinutes: null, availability: "unknown", availableMinutes: null, insideMinutes: null, utilisation: null }), week({ deliveredMinutes: null, availability: "unknown", availableMinutes: null, insideMinutes: null, utilisation: null })])] };
    const out = render(view("stale", unknown, { staleReason: "Delivered minutes unavailable; Availability unavailable" }));
    expect(out).toContain("delivered unavailable");
    expect(out).toContain("availability unavailable");
    expect(out).not.toContain("0 h delivered");
    expect(out).not.toContain("0%");
    expect(out).not.toContain("not entered");
  });
});
