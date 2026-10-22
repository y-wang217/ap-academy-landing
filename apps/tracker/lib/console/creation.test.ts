import { describe, expect, it } from "vitest";
import type { PanelResult, WorkRow } from "./contracts";
import { buildCreation, compareTasks, creationPanels, WEEKLY_MEDIA_REVIEW_PAGE_ID, type CreationEntry, type CreationView } from "./creation";

// REQ-60 T1: fixtures F1 to F13 and the panel status mapping (AC1 to AC4, AC6, AC7).
const TODAY = "2026-10-22";
const WORK_DS = "3031b455-9be0-4f8d-b200-70fcfcf1a0b8";
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const FALL = id(1);
const PED = id(2);
const CHILD = (n: number) => id(10 + n);
const WEEKLY = WEEKLY_MEDIA_REVIEW_PAGE_ID;

function row(over: Partial<WorkRow> & { id: string; name: string }): WorkRow {
  return {
    pageUrl: `https://www.notion.so/${over.id.replaceAll("-", "")}`, area: "Marketing", state: "Next", type: "Task", dueReview: null, dueReviewDate: null,
    owner: "Charlie", taskTypes: [], parentProjectIds: [], expectedResult: null, ...over,
  };
}
const due = (d: string) => ({ dueReview: d, dueReviewDate: d });

// F1: the live shape on 2026-10-22.
const LIVE: WorkRow[] = [
  row({ id: WEEKLY, name: "Weekly marketing performance review", type: "Recurring", state: "Next", ...due("2026-10-21") }),
  row({ id: CHILD(3), name: "Parent education 03", state: "Defined", parentProjectIds: [PED] }),
  row({ id: FALL, name: "Fall 2026 acquisition engine", type: "Project", state: "Doing", ...due("2026-10-21") }),
  row({ id: CHILD(1), name: "Parent education 01 - Understand the Ontario university pathway", state: "Next", parentProjectIds: [PED], expectedResult: "One reviewed vertical talking-head video" }),
  row({ id: CHILD(6), name: "Parent education 06", state: "Defined", parentProjectIds: [PED] }),
  row({ id: CHILD(2), name: "Parent education 02", state: "Defined", parentProjectIds: [PED] }),
  row({ id: PED, name: "Parent education videos, six-video pilot", type: "Project", state: "Doing" }),
  row({ id: CHILD(5), name: "Parent education 05", state: "Defined", parentProjectIds: [PED] }),
  row({ id: CHILD(4), name: "Parent education 04", state: "Defined", parentProjectIds: [PED] }),
];

const build = (rows: WorkRow[], selectedId: string | null = null, search = "mode=creation") =>
  buildCreation({ rows, today: TODAY, selectedId, search: new URLSearchParams(search), workSourceId: WORK_DS });
const names = (entries: { name: string }[]) => entries.map((e) => e.name);
const flat = (q: CreationEntry[]) => q.flatMap((e) => [e.id, ...e.children.map((c) => c.id)]);

describe("buildCreation", () => {
  it("F1: the live shape groups the six children under their project and picks 01 as next", () => {
    const v = build(LIVE);
    expect(names(v.queue)).toEqual(["Fall 2026 acquisition engine", "Parent education videos, six-video pilot", "Weekly marketing performance review"]);
    expect(v.queue[0]).toMatchObject({ due: "2026-10-21", overdue: true, children: [] });
    expect(v.queue[1].children.map((c) => c.id)).toEqual([CHILD(1), CHILD(2), CHILD(3), CHILD(4), CHILD(5), CHILD(6)]);
    expect(v.next?.id).toBe(CHILD(1));
    expect(v.next).toMatchObject({ state: "Next", type: "Task", due: null, owner: "Charlie", expectedResult: "One reviewed vertical talking-head video" });
    expect(v.next?.parent).toEqual({ id: PED, name: "Parent education videos, six-video pilot", pageUrl: `https://www.notion.so/${PED.replaceAll("-", "")}` });
    expect(v.weeklyReview).toMatchObject({ id: WEEKLY, overdue: true, isWeeklyReview: true });
    expect(v.queue[2].isWeeklyReview).toBe(true);
    expect(v.workDatabaseUrl).toBe(`https://www.notion.so/${WORK_DS.replaceAll("-", "")}`);
    expect(v.selected).toBeNull();
    expect(v.selectedMissing).toBe(false);
  });

  it("F2: a Done row and a Sales row appear nowhere", () => {
    const v = build([...LIVE, row({ id: id(90), name: "Done thing", state: "Done" }), row({ id: id(91), name: "Sales thing", area: "Sales" })]);
    expect(flat(v.queue)).not.toContain(id(90));
    expect(flat(v.queue)).not.toContain(id(91));
    expect(flat(v.queue)).toHaveLength(LIVE.length);
  });

  it("F3: within a rank, due ascending with missing dates last", () => {
    const v = build([
      row({ id: id(1), name: "A", ...due("2026-10-25") }),
      row({ id: id(2), name: "B" }),
      row({ id: id(3), name: "C", ...due("2026-10-20") }),
    ]);
    expect(names(v.queue)).toEqual(["C", "A", "B"]);
    expect(v.queue.map((e) => e.overdue)).toEqual([true, false, false]);
    expect(v.next?.name).toBe("C");
  });

  it("F4: Inbox, then no State, then Waiting / Blocked last; Waiting is never next", () => {
    const v = build([
      row({ id: id(1), name: "Waiting", state: "Waiting / Blocked", ...due("2026-10-01") }),
      row({ id: id(2), name: "No state", state: null }),
      row({ id: id(3), name: "Inbox", state: "Inbox" }),
    ]);
    expect(names(v.queue)).toEqual(["Inbox", "No state", "Waiting"]);
    expect(v.next?.name).toBe("Inbox");
    expect(build([row({ id: id(1), name: "Waiting", state: "Waiting / Blocked" }), row({ id: id(2), name: "Odd", state: "Someday" })]).next).toBeNull();
  });

  it("F5: a child whose parent is a Task stays top-level with a parent link", () => {
    const v = build([row({ id: id(1), name: "Parent task" }), row({ id: id(2), name: "Child", parentProjectIds: [id(1)] })]);
    expect(v.queue).toHaveLength(2);
    expect(v.queue.find((e) => e.id === id(2))?.parent).toMatchObject({ id: id(1), name: "Parent task" });
  });

  it("F6: a child whose parent is not in the read is top-level with an unnamed parent link", () => {
    const v = build([row({ id: id(2), name: "Child", parentProjectIds: [id(77)] })]);
    expect(v.queue[0].parent).toEqual({ id: id(77), name: null, pageUrl: `https://www.notion.so/${id(77).replaceAll("-", "")}` });
  });

  it("F7: only projects, recurring and waiting rows: no next, but the queue lists them", () => {
    const v = build([
      row({ id: id(1), name: "P", type: "Project", state: "Doing" }),
      row({ id: id(2), name: "R", type: "Recurring" }),
      row({ id: id(3), name: "W", state: "Waiting / Blocked" }),
    ]);
    expect(v.next).toBeNull();
    expect(v.queue).toHaveLength(3);
  });

  it("F8: missing owner and due are null, never invented", () => {
    const v = build([row({ id: id(1), name: "Bare", owner: null })]);
    expect(v.next).toMatchObject({ owner: null, due: null, overdue: false });
  });

  it("F9: Task Types keep their name or null, each with a page link", () => {
    const v = build([row({ id: id(1), name: "T", taskTypes: [{ id: id(50), name: "Script" }, { id: id(51), name: null }] })]);
    expect(v.next?.taskTypes).toEqual([
      { id: id(50), name: "Script", pageUrl: `https://www.notion.so/${id(50).replaceAll("-", "")}` },
      { id: id(51), name: null, pageUrl: `https://www.notion.so/${id(51).replaceAll("-", "")}` },
    ]);
  });

  it("F10: the pinned id in another Area or of another Type is not the weekly review", () => {
    expect(build([row({ id: WEEKLY, name: "W", type: "Recurring", area: "Sales" })]).weeklyReview).toBeNull();
    const asTask = build([row({ id: WEEKLY, name: "W", type: "Task" })]);
    expect(asTask.weeklyReview).toBeNull();
    expect(asTask.queue[0].isWeeklyReview).toBe(false);
  });

  it("F11: a selected Defined child fills the panel; next stays 01", () => {
    const v = build(LIVE, CHILD(2));
    expect(v.selected?.id).toBe(CHILD(2));
    expect(v.next?.id).toBe(CHILD(1));
    expect(v.selectedMissing).toBe(false);
  });

  it("F12: an unknown selection falls back to next and says so", () => {
    const v = build(LIVE, id(404));
    expect(v.selected).toBeNull();
    expect(v.selectedMissing).toBe(true);
    expect(v.next?.id).toBe(CHILD(1));
  });

  it("F13: the same row twice is listed once, whatever the id's case or dashes", () => {
    const v = build([row({ id: id(1), name: "Once" }), row({ id: id(1).toUpperCase().replaceAll("-", ""), name: "Once" })]);
    expect(v.queue).toHaveLength(1);
  });

  it("select links keep the other parameters and set task", () => {
    const v = build(LIVE, null, "mode=creation&week=2026-10-19&task=old");
    const href = new URLSearchParams(v.queue[0].selectHref.slice(1));
    expect(v.queue[0].selectHref.startsWith("?")).toBe(true);
    expect(Object.fromEntries(href)).toEqual({ mode: "creation", week: "2026-10-19", task: FALL });
  });

  it("selection matches ids in any form", () => {
    expect(build(LIVE, CHILD(2).replaceAll("-", "").toUpperCase()).selected?.id).toBe(CHILD(2));
  });

  it("compareTasks orders by rank, due, name, id", () => {
    const v = build([row({ id: id(2), name: "Same" }), row({ id: id(1), name: "Same" })]);
    expect(v.queue.map((e) => e.id)).toEqual([id(1), id(2)]);
    expect([...v.queue].sort(compareTasks).map((e) => e.id)).toEqual([id(1), id(2)]);
  });
});

// AC7: the three panels from the facade's work result.
const CHECKED = "2026-10-22T18:00:00.000Z";
function facade(status: PanelResult<WorkRow[]>["status"], data: WorkRow[] | null, extra: Partial<PanelResult<WorkRow[]>> = {}): PanelResult<WorkRow[]> {
  return {
    panel: "work", status, data, count: data?.length ?? null, lastCheckedAt: CHECKED, lastSuccessfulFetchAt: status === "error" ? null : CHECKED,
    staleReason: null, errorMessage: null,
    sourceEvidence: [{ source: "notion", sourceId: WORK_DS, sourceUrl: `https://www.notion.so/${WORK_DS.replaceAll("-", "")}`, observedAt: CHECKED }],
    ...extra,
  };
}
const panels = (r: PanelResult<WorkRow[]>, selectedId: string | null = null) =>
  creationPanels(r, { today: TODAY, selectedId, search: new URLSearchParams("mode=creation"), workSourceId: WORK_DS });
const all = (p: ReturnType<typeof panels>) => [p.nextAsset, p.work, p.pipeline];

describe("creationPanels", () => {
  it("ready: counts, evidence, times and the Work link on each panel", () => {
    const p = panels(facade("ready", LIVE));
    expect(all(p).map((x) => x.status)).toEqual(["ready", "ready", "ready"]);
    expect([p.nextAsset.count, p.work.count, p.pipeline.count]).toEqual([1, LIVE.length, 1]);
    for (const x of all(p)) {
      expect(x.sourceEvidence[0].sourceId).toBe(WORK_DS);
      expect(x.lastCheckedAt).toBe(CHECKED);
      expect(x.lastSuccessfulFetchAt).toBe(CHECKED);
      expect(x.canonical).toEqual({ href: `https://www.notion.so/${WORK_DS.replaceAll("-", "")}`, label: "Open Work in Notion" });
    }
    expect((p.work.data as CreationView).queue).toHaveLength(3);
  });

  it("error: all three error with the facade's message and no data", () => {
    const p = panels(facade("error", null, { errorMessage: "Work is missing Parent Project" }));
    for (const x of all(p)) expect(x).toMatchObject({ status: "error", data: null, count: null, errorMessage: "Work is missing Parent Project", lastSuccessfulFetchAt: null });
    for (const x of all(p)) expect(x.canonical?.label).toBe("Open Work in Notion");
  });

  it("stale by page cap: all three stale with the reason, rows kept", () => {
    const p = panels(facade("stale", LIVE, { staleReason: "Stopped after 10 pages; showing 9 rows" }));
    for (const x of all(p)) expect(x).toMatchObject({ status: "stale", staleReason: "Stopped after 10 pages; showing 9 rows" });
    expect((p.nextAsset.data as CreationView).next?.id).toBe(CHILD(1));
  });

  it("complete with no open Marketing rows: three empty panels", () => {
    const p = panels(facade("empty", []));
    expect(all(p).map((x) => x.status)).toEqual(["empty", "empty", "empty"]);
    const sales = panels(facade("ready", [row({ id: id(1), name: "S", area: "Sales" })]));
    expect(all(sales).map((x) => x.status)).toEqual(["empty", "empty", "empty"]);
  });

  it("F7: rows but none eligible: next asset empty, queue ready", () => {
    const p = panels(facade("ready", [row({ id: id(1), name: "P", type: "Project", state: "Doing" })]));
    expect([p.nextAsset.status, p.work.status, p.pipeline.status]).toEqual(["empty", "ready", "empty"]);
  });

  it("a selection keeps the next asset panel ready even with no eligible next", () => {
    const p = panels(facade("ready", [row({ id: id(1), name: "W", state: "Waiting / Blocked" })]), id(1));
    expect(p.nextAsset.status).toBe("ready");
  });

  it("a build that throws is an error, Read failed", () => {
    const nameless = (n: number) => ({ ...row({ id: id(n), name: "X" }), name: undefined as unknown as string });
    const bad = facade("ready", [nameless(1), nameless(2)]);
    const p = panels(bad);
    for (const x of all(p)) expect(x).toMatchObject({ status: "error", errorMessage: "Read failed" });
  });
});
