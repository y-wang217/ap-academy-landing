import { TUNING } from "../domain/tuning";
import { localHhmm } from "../time";

/**
 * Copy for the people copy's freshness (REQ-38). Pure: every caller passes
 * the last good sync time and "now". No em-dashes (AC17).
 */
const MINUTE = 60_000;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * The one notice above any page that shows people data: null while the copy
 * is fresh, else how old it is. The data still renders under it (AC11).
 */
export function peopleFreshness(lastOk: string | null, now: Date): string | null {
  if (!lastOk) return "Names have not been loaded yet.";
  const minutes = Math.floor((now.getTime() - Date.parse(lastOk)) / MINUTE);
  if (!(minutes >= TUNING.peopleStaleMinutes)) return null;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Names last updated ${plural(hours, "hour")} ago`;
  return `Names last updated ${plural(Math.floor(hours / 24), "day")} ago`;
}

function ago(at: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / MINUTE));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${plural(hours, "hour")} ago`;
  return `${plural(Math.floor(hours / 24), "day")} ago`;
}

export type SyncRunsView = { lastOk: { finishedAt: string } | null; lastFailure: { finishedAt: string } | null };

/** The owner's status line under the daily task (AC15). Never claims success after a failure. */
export function peopleSyncLine(runs: SyncRunsView, now: Date): string {
  const { lastOk, lastFailure } = runs;
  const failedLast = lastFailure && (!lastOk || Date.parse(lastFailure.finishedAt) > Date.parse(lastOk.finishedAt));
  if (failedLast) {
    const at = localHhmm(new Date(lastFailure.finishedAt));
    return lastOk
      ? `Last sync failed at ${at}. Names are from ${localHhmm(new Date(lastOk.finishedAt))}.`
      : `Last sync failed at ${at}. Names have not been loaded yet.`;
  }
  if (lastOk) return `Names synced ${ago(lastOk.finishedAt, now)}.`;
  return "Names have not been synced yet.";
}
