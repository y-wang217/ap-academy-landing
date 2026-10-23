import { normalId } from "../domain/billing";
import { notionPageUrl, type PanelResult, type WorkRow } from "./contracts";
import type { PanelView } from "./panel-view";

/**
 * Creation mode (REQ-60, tracker ADR 0070): the next marketing deliverable, the
 * open Marketing work queue and the weekly media review, built from the
 * facade's live Work rows. Pure: no I/O, nothing synthesised, nothing written.
 * Completion stays in Notion; a row marked Done leaves on the next load.
 */
export const WEEKLY_MEDIA_REVIEW_PAGE_ID = "3ead6ae7-3dd7-811e-b525-e3626520b805";
/** Queue order by State. No State, or one not listed, ranks 4. */
export const STATE_RANK: Record<string, number> = { Doing: 0, Next: 1, Defined: 2, Inbox: 3, "Waiting / Blocked": 5 };
const UNKNOWN_RANK = 4;
const NEXT_MAX_RANK = 3;
const WORK_LINK_LABEL = "Open Work in Notion";

export type CreationTask = {
  id: string;
  name: string;
  pageUrl: string;
  state: string | null;
  type: string | null;
  due: string | null;
  overdue: boolean;
  owner: string | null;
  taskTypes: { id: string; name: string | null; pageUrl: string }[];
  parent: { id: string; name: string | null; pageUrl: string } | null;
  expectedResult: string | null;
  isWeeklyReview: boolean;
  selectHref: string;
};
export type CreationEntry = CreationTask & { children: CreationTask[] };
export type CreationView = {
  queue: CreationEntry[];
  next: CreationTask | null;
  selected: CreationTask | null;
  selectedMissing: boolean;
  weeklyReview: CreationTask | null;
  workDatabaseUrl: string;
};
export type CreationInput = { rows: WorkRow[]; today: string; selectedId: string | null; search: URLSearchParams; workSourceId: string; weeklyReviewId?: string };

const rank = (t: Pick<CreationTask, "state">) => (t.state !== null && t.state in STATE_RANK ? STATE_RANK[t.state] : UNKNOWN_RANK);

/** State rank, then Due / Review ascending with missing dates last, then name, then id. */
export function compareTasks(a: CreationTask, b: CreationTask): number {
  const byRank = rank(a) - rank(b);
  if (byRank) return byRank;
  if (a.due !== b.due) {
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function buildCreation(input: CreationInput): CreationView {
  const weeklyId = normalId(input.weeklyReviewId ?? WEEKLY_MEDIA_REVIEW_PAGE_ID);
  const seen = new Map<string, WorkRow>();
  for (const r of input.rows) {
    if (r.area !== "Marketing" || r.state === "Done") continue;
    if (!seen.has(normalId(r.id))) seen.set(normalId(r.id), r);
  }
  const href = (id: string) => {
    const params = new URLSearchParams(input.search);
    params.set("task", id);
    return `?${params.toString()}`;
  };
  const tasks = [...seen.values()].map((r): CreationTask => {
    const parentId = r.parentProjectIds[0] ?? null;
    const parentRow = parentId ? seen.get(normalId(parentId)) : undefined;
    const due = r.dueReviewDate;
    return {
      id: r.id,
      name: r.name,
      pageUrl: r.pageUrl,
      state: r.state,
      type: r.type,
      due,
      overdue: due !== null && due < input.today,
      owner: r.owner,
      taskTypes: r.taskTypes.map((t) => ({ id: t.id, name: t.name, pageUrl: notionPageUrl(t.id) })),
      parent: parentId ? { id: parentId, name: parentRow?.name ?? null, pageUrl: notionPageUrl(parentId) } : null,
      expectedResult: r.expectedResult,
      isWeeklyReview: normalId(r.id) === weeklyId && r.type === "Recurring",
      selectHref: href(r.id),
    };
  });
  tasks.sort(compareTasks);

  // One level of grouping: a row sits under its first parent when that parent is an open Project.
  const projects = new Set(tasks.filter((t) => t.type === "Project").map((t) => normalId(t.id)));
  const childOf = (t: CreationTask) => (t.parent && projects.has(normalId(t.parent.id)) && normalId(t.parent.id) !== normalId(t.id) ? normalId(t.parent.id) : null);
  const children = new Map<string, CreationTask[]>();
  for (const t of tasks) {
    const p = childOf(t);
    if (p) children.set(p, [...(children.get(p) ?? []), t]);
  }
  const queue = tasks.filter((t) => !childOf(t)).map((t) => ({ ...t, children: children.get(normalId(t.id)) ?? [] }));

  const next = tasks.find((t) => t.type !== "Project" && t.type !== "Recurring" && rank(t) <= NEXT_MAX_RANK) ?? null;
  const selected = input.selectedId ? tasks.find((t) => normalId(t.id) === normalId(input.selectedId!)) ?? null : null;
  return {
    queue,
    next,
    selected,
    selectedMissing: Boolean(input.selectedId) && selected === null,
    weeklyReview: tasks.find((t) => t.isWeeklyReview) ?? null,
    workDatabaseUrl: notionPageUrl(input.workSourceId),
  };
}

type CreationPanels = { nextAsset: PanelView<CreationView>; work: PanelView<CreationView>; pipeline: PanelView<CreationView> };

/**
 * The three Creation panels from the facade's work result (AC7): an error stays an error on all
 * three, a page-cap stop stays stale with its rows, and each panel is empty on its own terms.
 * The Work database link rides on every panel in every status.
 */
export function creationPanels(work: PanelResult<WorkRow[]>, input: Omit<CreationInput, "rows">): CreationPanels {
  const canonical = { href: notionPageUrl(input.workSourceId), label: WORK_LINK_LABEL };
  const base = {
    lastCheckedAt: work.lastCheckedAt, lastSuccessfulFetchAt: work.lastSuccessfulFetchAt, sourceEvidence: work.sourceEvidence, canonical,
  };
  const failed = (errorMessage: string | null): CreationPanels => {
    const one = (panel: string): PanelView<CreationView> => ({ ...base, panel, status: "error", data: null, count: null, staleReason: null, errorMessage });
    return { nextAsset: one("nextAsset"), work: one("work"), pipeline: one("pipeline") };
  };
  if (work.status === "error" || work.data === null) return failed(work.errorMessage);
  let view: CreationView;
  try {
    view = buildCreation({ ...input, rows: work.data });
  } catch {
    return failed("Read failed");
  }
  const rows = view.queue.reduce((n, e) => n + 1 + e.children.length, 0);
  const one = (panel: string, count: number): PanelView<CreationView> => {
    const stale = work.status === "stale";
    return {
      ...base, panel, status: stale ? "stale" : count === 0 ? "empty" : "ready", data: view, count,
      staleReason: stale ? work.staleReason : null, errorMessage: null,
    };
  };
  return {
    nextAsset: one("nextAsset", (view.selected ?? view.next) ? 1 : 0),
    work: one("work", rows),
    pipeline: one("pipeline", view.weeklyReview ? 1 : 0),
  };
}
