import type { ExportOutT } from "../scheduler/schemas";
import { localHhmm } from "../time";

/**
 * Copy and state for the week editor's "Notion exports" strip (REQ-35 AC11).
 * Pure and client safe. Plain, short, no em-dashes.
 */
export type StripLine = { id: string; label: string; state: string; action: "Retry" | "Retry now" };

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function stripLine(e: ExportOutT): StripLine {
  const label = e.kind === "summary" ? `${e.name ?? "A student"} Weekly Schedule` : "Today's task";
  if (e.status === "failed") return { id: e.id, label, state: `Failed. ${sentence(e.lastError ?? "Notion did not take it")}`, action: "Retry" };
  if (e.status === "uncertain") return { id: e.id, label, state: "May have been updated. Check it in Notion.", action: "Retry" };
  const since = `Waiting since ${localHhmm(new Date(e.requestedAt))}.`;
  if (e.status === "running") return { id: e.id, label, state: `${since} Sending now.`, action: "Retry now" };
  return { id: e.id, label, state: `${since} Next try ${localHhmm(new Date(e.nextAttemptAt))}.`, action: "Retry now" };
}

export const STRIP_TITLE = "Notion exports";
export const LOAD_FAILED = "Could not load Notion exports.";
export const REFRESH_FAILED = "Could not refresh. Showing the last list.";

/**
 * loading: before the first answer; the strip renders nothing, so the week
 * grid does not jump. empty: nothing open, hidden. list: one line per row.
 * failed: the first load failed. A failed refresh keeps the last list.
 */
export type StripState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "list"; rows: ExportOutT[]; refreshFailed: boolean }
  | { kind: "failed" };
export type StripEvent = { type: "loaded"; rows: ExportOutT[] } | { type: "load_failed" };

export function stripState(prev: StripState, event: StripEvent): StripState {
  if (event.type === "loaded") return event.rows.length === 0 ? { kind: "empty" } : { kind: "list", rows: event.rows, refreshFailed: false };
  if (prev.kind === "list") return { ...prev, refreshFailed: true };
  // A failed refresh of an empty strip stays hidden: there was nothing to show.
  if (prev.kind === "empty") return prev;
  return { kind: "failed" };
}

/** Poll again while anything is still on its way. */
export const shouldPoll = (s: StripState) => s.kind === "list" && s.rows.some((r) => r.status === "pending" || r.status === "running");
