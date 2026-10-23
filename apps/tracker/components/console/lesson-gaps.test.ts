import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LessonGapsData } from "../../lib/console/operations";
import { PANEL_STATUSES, type PanelStatus, type PanelView } from "../../lib/console/panel-view";
import { LessonGaps } from "./lesson-gaps";

// REQ-58 AC3, AC5, AC6, AC8: the lesson gaps panel.
const NOW = "2026-10-22T20:00:00.000Z";
const KEY = (d: string) => `sched:c0000000-0000-4000-8000-000000000001:${d}`;
const DATA: LessonGapsData = {
  window: { from: "2026-10-09", to: "2026-10-22", days: 14, label: "Last 14 days" },
  gaps: [
    { id: KEY("2026-10-15"), key: KEY("2026-10-15"), title: "Sam S. with Ryan M., MHF4U", action: "log", reason: "Log", ended: "ended Thu 15 Oct 11:00", endedAt: "2026-10-15T15:00:00.000Z", href: "/tracker/schedule?date=2026-10-15&staffId=r" },
    { id: KEY("2026-10-22"), key: KEY("2026-10-22"), title: "Sam S. with Ryan M., MHF4U", action: "link", reason: "Link existing lesson (2 candidates)", ended: "ended Thu 22 Oct 11:00", endedAt: "2026-10-22T15:00:00.000Z", href: "/tracker/schedule/lessons?from=2026-10-09&to=2026-10-22" },
  ],
  moreGaps: 0,
  noShows: [{ id: "n1", key: KEY("2026-10-08"), title: "Sam S. with Ryan M., MHF4U", ended: "ended Thu 8 Oct 11:00", href: "/tracker/schedule?date=2026-10-08&staffId=r" }],
  moreNoShows: 0,
  pendingLogs: 1,
  toggle: { href: "?mode=operations&gapDays=31", label: "Show 31 days" },
  unlinkedHref: "/tracker/schedule/lessons?from=2026-10-09&to=2026-10-22",
};
const CANONICAL = { href: "/tracker/schedule/lessons?from=2026-10-09&to=2026-10-22", label: "Open unlinked lessons" };
const view = (status: PanelStatus, data: LessonGapsData | null = DATA, extra: Partial<PanelView<LessonGapsData>> = {}): PanelView<LessonGapsData> => ({
  panel: "lessonGaps", status, data, count: 2, lastCheckedAt: NOW, lastSuccessfulFetchAt: NOW, staleReason: status === "stale" ? "Lesson candidates unavailable" : null,
  errorMessage: status === "error" ? "Lessons is missing Class occurrence" : null, sourceEvidence: [], ...extra,
});
const render = (v: PanelView<LessonGapsData>) => renderToStaticMarkup(h(LessonGaps, { id: "lessonGaps", title: "Lesson log gaps", emptyText: "Nothing due", canonical: CANONICAL, result: v }));

describe("LessonGaps", () => {
  it.each(PANEL_STATUSES)("%s keeps the canonical link", (status) => {
    expect(render(view(status))).toContain('class="console-canonical" data-canonical="">Open unlinked lessons</a>');
  });

  it("lists each gap with its key, next action, end time and deep link", () => {
    const out = render(view("ready"));
    expect(out).toContain(`data-gap="${KEY("2026-10-15")}" data-action="log"`);
    expect(out).toContain(`<code>${KEY("2026-10-15")}</code>`);
    expect(out).toContain("ended Thu 15 Oct 11:00");
    expect(out).toContain('href="/tracker/schedule?date=2026-10-15&amp;staffId=r"');
    expect(out).toContain("Link existing lesson (2 candidates)");
  });

  it("no-shows are their own list, never gaps; logs in progress are noted", () => {
    const out = render(view("ready"));
    const gaps = out.slice(out.indexOf("data-gaps"), out.indexOf("data-no-shows"));
    expect(gaps).not.toContain(KEY("2026-10-08"));
    expect(out).toContain("No-shows (1)");
    expect(out).toContain(`data-no-show="${KEY("2026-10-08")}"`);
    expect(out).toContain("1 log in progress");
  });

  it("shows its window and the toggle to the other preset", () => {
    const out = render(view("ready"));
    expect(out).toContain("Last 14 days. ");
    expect(out).toContain('<a href="?mode=operations&amp;gapDays=31">Show 31 days</a>');
  });

  it("an error prints the message verbatim and no rows", () => {
    const out = render(view("error", null));
    expect(out).toContain("Lessons is missing Class occurrence");
    expect(out).not.toContain("data-gap=");
  });

  it("past the cap ends with an N more link", () => {
    expect(render(view("ready", { ...DATA, moreGaps: 3 }))).toContain('<a href="/tracker/schedule/lessons?from=2026-10-09&amp;to=2026-10-22">3 more</a>');
  });
});
