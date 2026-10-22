import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkRow } from "../../../lib/console/contracts";
import { buildCreation, WEEKLY_MEDIA_REVIEW_PAGE_ID, type CreationView } from "../../../lib/console/creation";
import { PANEL_STATUSES, type PanelStatus, type PanelView } from "../../../lib/console/panel-view";
import { NextAsset } from "./next-asset";
import { WeeklyReview } from "./weekly-review";
import { WorkQueue } from "./work-queue";

// REQ-60 AC1 to AC7: the three Creation panels, rendered.
const NOW = "2026-10-22T18:00:00.000Z";
const WORK_DS = "3031b455-9be0-4f8d-b200-70fcfcf1a0b8";
const WORK_URL = `https://www.notion.so/${WORK_DS.replaceAll("-", "")}`;
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PROJECT = id(1);
const ONE = id(11);
const TWO = id(12);
const row = (over: Partial<WorkRow> & { id: string; name: string }): WorkRow => ({
  pageUrl: `https://www.notion.so/${over.id.replaceAll("-", "")}`, area: "Marketing", state: "Next", type: "Task", dueReview: null, dueReviewDate: null,
  owner: "Charlie", taskTypes: [], parentProjectIds: [], expectedResult: null, ...over,
});
const ROWS: WorkRow[] = [
  row({ id: PROJECT, name: "Parent education videos", type: "Project", state: "Doing" }),
  row({ id: ONE, name: "Parent education 01", parentProjectIds: [PROJECT], expectedResult: "One reviewed video", taskTypes: [{ id: id(50), name: "Script" }, { id: id(51), name: null }] }),
  row({ id: TWO, name: "Parent education 02", state: "Defined", parentProjectIds: [PROJECT] }),
  row({ id: id(3), name: "Loose task", state: "Inbox", owner: null, dueReview: "2026-10-20", dueReviewDate: "2026-10-20", parentProjectIds: [id(77)] }),
  row({ id: WEEKLY_MEDIA_REVIEW_PAGE_ID, name: "Weekly marketing performance review", type: "Recurring", dueReview: "2026-10-21", dueReviewDate: "2026-10-21" }),
];
const view = (selectedId: string | null = null, rows = ROWS) =>
  buildCreation({ rows, today: "2026-10-22", selectedId, search: new URLSearchParams("mode=creation"), workSourceId: WORK_DS });
const result = (status: PanelStatus, data: CreationView | null = view()): PanelView<CreationView> => ({
  panel: "x", status, data: status === "ready" || status === "stale" ? data : null, count: 1, lastCheckedAt: NOW, lastSuccessfulFetchAt: NOW,
  staleReason: status === "stale" ? "Stopped after 10 pages; showing 5 rows" : null, errorMessage: status === "error" ? "Work is missing Area" : null, sourceEvidence: [],
  canonical: { href: WORK_URL, label: "Open Work in Notion" },
});
const frame = (slot: string, title: string, emptyText: string) => ({ id: slot, title, emptyText });
const next = (r: PanelView<CreationView>, interrupt?: ReturnType<typeof h>) =>
  renderToStaticMarkup(h(NextAsset, { ...frame("nextAsset", "Next asset", "Queue clear"), result: r, interrupt }));
const queue = (r: PanelView<CreationView>) => renderToStaticMarkup(h(WorkQueue, { ...frame("work", "Work queue", "No tasks scheduled"), result: r }));
const weekly = (r: PanelView<CreationView>) => renderToStaticMarkup(h(WeeklyReview, { ...frame("pipeline", "Weekly media review", "No weekly media review task found"), result: r }));
const RENDERERS = [["next asset", next], ["work queue", queue], ["weekly review", weekly]] as const;
const attr = (out: string, name: string) => [...out.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => m[1]);

describe.each(RENDERERS)("%s", (_name, render) => {
  it.each(PANEL_STATUSES)("%s keeps the Work database link", (status) => {
    expect(render(result(status))).toContain(`<a href="${WORK_URL}" class="console-canonical" data-canonical="">Open Work in Notion</a>`);
  });

  it("has no button or form (AC4)", () => {
    for (const status of PANEL_STATUSES) {
      const out = render(result(status));
      expect(out).not.toContain("<button");
      expect(out).not.toContain("<form");
    }
  });

  it("an error prints the message and no task", () => {
    const out = render(result("error"));
    expect(out).toContain("Work is missing Area");
    expect(out).not.toContain("data-task-id");
    expect(out).not.toContain("data-task=");
  });

  it("stale shows its rows and the reason", () => {
    const out = render(result("stale"));
    expect(out).toContain("Stopped after 10 pages; showing 5 rows");
    expect(out).toContain("data-panel-value");
  });
});

describe("NextAsset (AC1, AC5, AC6)", () => {
  it("shows the next task's facts, tagged Next, with its Notion link", () => {
    const out = next(result("ready"));
    expect(attr(out, "data-task-id")).toEqual([ONE]);
    expect(out).toContain('<span class="console-next-tag">Next</span>');
    expect(out).toContain("Parent education 01");
    for (const s of ["Next", "Task", "Due not set", "Charlie", "One reviewed video", "Script", "Name unavailable", "Parent education videos"]) expect(out).toContain(s);
    expect(out).toContain(`href="https://www.notion.so/${id(50).replaceAll("-", "")}"`);
    expect(out).toContain(`href="https://www.notion.so/${ONE.replaceAll("-", "")}">Open in Notion</a>`);
  });

  it("a selected task is tagged Selected", () => {
    const out = next(result("ready", view(TWO)));
    expect(attr(out, "data-task-id")).toEqual([TWO]);
    expect(out).toContain('<span class="console-next-tag">Selected</span>');
    expect(out).toContain("No expected result");
    expect(out).toContain("Task type not set");
  });

  it("a selection no longer open falls back to next with a note", () => {
    const out = next(result("ready", view(id(404))));
    expect(attr(out, "data-task-id")).toEqual([ONE]);
    expect(out).toContain("The selected task is no longer open in Notion");
  });

  it("missing owner and an overdue date are labelled", () => {
    const out = next(result("ready", view(id(3))));
    expect(out).toContain("Owner not set");
    expect(out).toContain("20 Oct");
    expect(out).toContain("Overdue");
    expect(out).toContain(`href="https://www.notion.so/${id(77).replaceAll("-", "")}">Parent project</a>`);
  });

  it("with no interrupt there is no banner; a stub banner leaves the task and links unchanged", () => {
    const plain = next(result("ready"));
    expect(plain).not.toContain("data-interrupt");
    const banner = next(result("ready"), h("p", null, "Fresh lead: call now"));
    expect(banner).toContain("data-interrupt");
    expect(banner.indexOf("data-interrupt")).toBeLessThan(banner.indexOf("data-task-id"));
    expect(attr(banner, "data-task-id")).toEqual(attr(plain, "data-task-id"));
    expect(attr(banner, "href")).toEqual(attr(plain, "href"));
  });

  it("empty says Queue clear", () => {
    expect(next(result("empty"))).toContain("Queue clear");
  });
});

describe("WorkQueue (AC2, AC6)", () => {
  it("nests children under their project and keeps the rest top-level", () => {
    const out = queue(result("ready"));
    const top = out.slice(0, out.indexOf("console-creation-children"));
    expect(top).toContain(`data-task="${PROJECT}"`);
    const nested = out.slice(out.indexOf("console-creation-children"), out.indexOf("</ol>", out.indexOf("console-creation-children")));
    expect(attr(nested, "data-task")).toEqual([ONE, TWO]);
    expect(attr(out, "data-task")).toEqual([PROJECT, ONE, TWO, WEEKLY_MEDIA_REVIEW_PAGE_ID, id(3)]);
  });

  it("labels the weekly review, overdue rows, missing values and outside parents", () => {
    const out = queue(result("ready"));
    expect(out).toContain("Weekly review");
    expect(out).toContain("Overdue");
    expect(out).toContain("Owner not set");
    expect(out).toContain("Due not set");
    expect(out).toContain(">Parent project</a>");
  });

  it("each row has Select and Open links; the selected row carries aria-current", () => {
    const out = queue(result("ready", view(TWO)));
    expect(out).toContain(`href="?mode=creation&amp;task=${TWO}"`);
    expect(out).toContain(`href="https://www.notion.so/${TWO.replaceAll("-", "")}"`);
    expect(out.match(/aria-current="true"/g)).toHaveLength(1);
    expect(out).toMatch(new RegExp(`data-task="${TWO}"[^>]*aria-current="true"`));
  });
});

describe("WeeklyReview (AC3)", () => {
  it("shows the pinned row with its facts", () => {
    const out = weekly(result("ready"));
    expect(attr(out, "data-task-id")).toEqual([WEEKLY_MEDIA_REVIEW_PAGE_ID]);
    expect(out).toContain("Weekly marketing performance review");
    expect(out).toContain("21 Oct");
    expect(out).toContain("Overdue");
  });

  const noneFound = (out: string) => {
    expect(out).toContain("No weekly media review task found");
    expect(out).toContain("If it is marked Done or was moved, it is not shown");
    expect(out).toContain(`href="https://www.notion.so/${WEEKLY_MEDIA_REVIEW_PAGE_ID.replaceAll("-", "")}"`);
    expect(out).toContain(`href="${WORK_URL}">Create one in Notion</a>`);
  };
  it("empty says none found, why, and links to the pinned page and the database", () => {
    noneFound(weekly(result("empty")));
  });
  it("stale rows without the weekly review say none found too", () => {
    noneFound(weekly(result("stale", view(null, ROWS.slice(0, 2)))));
  });
});
