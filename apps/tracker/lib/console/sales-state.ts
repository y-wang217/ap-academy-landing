import { hhmm } from "./format";
import type { PanelView } from "./panel-view";
import type { SalesFilter, SalesLead, SalesQueue, SalesRadarStage, SalesView } from "./sales-view";
import type { SyncState } from "./sync";

/**
 * The Sales queue's client state (REQ-57, tracker ADR 0071). Pure, so it is
 * tested in node without a DOM, like sync-poller.ts. The last good queue is
 * kept in memory only: a failed or truncated refresh never empties the
 * queue on screen, and a reload starts from a fresh read.
 */
export type Filter = "all" | SalesFilter;
export const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "new", label: "New" }, { key: "due", label: "Due" }, { key: "postTrial", label: "Post-trial" }, { key: "later", label: "Later" },
];

type Failure = { at: string; kind: "failed" | "incomplete"; message: string };
export type SalesState = { shown: SalesView; lastGood: SalesView | null; fetch: "idle" | "busy"; failure: Failure | null; filter: Filter; selectedId: string | null };
export type SalesAction =
  | { type: "refreshStart" }
  | { type: "refreshOk"; view: SalesView; at: string }
  | { type: "refreshFailed"; message: string; at: string }
  | { type: "setFilter"; filter: Filter }
  | { type: "move"; key: string }
  | { type: "select"; id: string };

/** A view worth keeping: a complete read, ready, empty or stale for a reason other than the page cap. */
const isGood = (v: SalesView) => v.queue.data !== null && v.queue.status !== "error" && !v.queue.data.truncated;

export function initialSalesState(view: SalesView): SalesState {
  const lastGood = isGood(view) ? view : null;
  const first = view.queue.data?.items[0]?.id ?? null;
  return { shown: view, lastGood, fetch: "idle", failure: null, filter: "all", selectedId: first };
}

function failedView(view: SalesView, message: string, at: string): SalesView {
  const fail = <T,>(r: PanelView<T>): PanelView<T> => ({ ...r, status: "error", data: null, count: null, lastCheckedAt: at, staleReason: null, errorMessage: message });
  return { queue: fail(view.queue), radar: fail(view.radar) };
}

/** The queue on screen: the last good one with the AC6 line while a failure stands, else what was shown. */
export function retainedView(state: SalesState): PanelView<SalesQueue> {
  return retained(state, (v) => v.queue);
}
export function retainedRadar(state: SalesState): PanelView<SalesRadarStage[]> {
  return retained(state, (v) => v.radar);
}
function retained<T>(state: SalesState, pick: (v: SalesView) => PanelView<T>): PanelView<T> {
  const { failure, lastGood } = state;
  if (!failure || !lastGood) return pick(state.shown);
  const good = pick(lastGood);
  const from = good.lastSuccessfulFetchAt ?? good.lastCheckedAt;
  const since = from ? hhmm(from) : "earlier";
  const line = failure.kind === "failed"
    ? `Refresh failed at ${hhmm(failure.at)}: ${failure.message}. Showing the queue from ${since}.`
    : `Latest read incomplete: ${failure.message}. Showing the queue from ${since}.`;
  return { ...good, status: "stale", staleReason: line, lastCheckedAt: failure.at, lastSuccessfulFetchAt: good.lastSuccessfulFetchAt };
}

const allItems = (state: SalesState): SalesLead[] => retainedView(state).data?.items ?? [];

export function visibleItems(state: SalesState): SalesLead[] {
  const items = allItems(state);
  return state.filter === "all" ? items : items.filter((i) => i.filter === state.filter);
}

export function filterCounts(state: SalesState): Record<Filter, number> {
  const items = allItems(state);
  const of = (f: SalesFilter) => items.filter((i) => i.filter === f).length;
  return { all: items.length, new: of("new"), due: of("due"), postTrial: of("postTrial"), later: of("later") };
}

/** The selected lead: the chosen one while it is visible, else the first visible, else none. */
export function selectedOf(state: SalesState): string | null {
  const visible = visibleItems(state);
  return visible.some((i) => i.id === state.selectedId) ? state.selectedId : visible[0]?.id ?? null;
}

/** Arrow keys move by one with no wrap; Home and End go to the ends; anything else is null. */
export function queueKeyTarget(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return Math.min(index + 1, count - 1);
    case "ArrowUp":
      return Math.max(index - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function salesReducer(state: SalesState, action: SalesAction): SalesState {
  switch (action.type) {
    case "refreshStart":
      return { ...state, fetch: "busy" };
    case "refreshOk": {
      const { view, at } = action;
      if (isGood(view)) return { ...state, shown: view, lastGood: view, fetch: "idle", failure: null };
      if (state.lastGood) {
        const failure: Failure = view.queue.status === "error" || view.queue.data === null
          ? { at, kind: "failed", message: view.queue.errorMessage ?? "Read failed" }
          : { at, kind: "incomplete", message: view.queue.staleReason ?? "page cap reached" };
        return { ...state, fetch: "idle", failure };
      }
      return { ...state, shown: view, fetch: "idle", failure: null };
    }
    case "refreshFailed": {
      const failure: Failure = { at: action.at, kind: "failed", message: action.message };
      if (state.lastGood) return { ...state, fetch: "idle", failure };
      return { ...state, shown: failedView(state.shown, action.message, action.at), fetch: "idle", failure };
    }
    case "setFilter": {
      const next = { ...state, filter: action.filter };
      return { ...next, selectedId: visibleItems(next)[0]?.id ?? null };
    }
    case "move": {
      const visible = visibleItems(state);
      const index = visible.findIndex((i) => i.id === selectedOf(state));
      const target = queueKeyTarget(action.key, Math.max(index, 0), visible.length);
      return target === null ? state : { ...state, selectedId: visible[target].id };
    }
    case "select":
      return { ...state, selectedId: action.id };
  }
}

/** The first ok or degraded health check after mount is only recorded; each later new one asks for one refresh. */
export function shouldRefreshOnSync(seen: string | null, sync: SyncState): { refresh: boolean; seen: string | null } {
  if ((sync.kind !== "ok" && sync.kind !== "degraded") || sync.checkedAt === null || sync.checkedAt === seen) return { refresh: false, seen };
  return { refresh: seen !== null, seen: sync.checkedAt };
}
