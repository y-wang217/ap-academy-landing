import type { AvailabilityDay } from "../domain/schedule/availability";
import type { Occurrence } from "../domain/schedule/recurrence";
import { minutesOf } from "../domain/schedule/wallclock";

export const ROW_MINUTES = 15;
const DEFAULT_START = 8 * 60;
const DEFAULT_END = 21 * 60;

/** Index of the 15-minute row a wall-clock time falls in, counted from midnight. */
export const rowOf = (time: string) => Math.floor(minutesOf(time) / ROW_MINUTES);

export type Placed<T extends Pick<Occurrence, "startTime" | "endTime">> = { occurrence: T; lane: number; laneCount: number };

/**
 * Side-by-side lanes for one day. Greedy by start time; a class that ends when
 * the next starts reuses its lane. laneCount is the widest overlap within a
 * cluster of touching-by-overlap classes, so a lone later class stays full width.
 */
export function layoutDay<T extends Pick<Occurrence, "startTime" | "endTime">>(occurrences: T[]): Placed<T>[] {
  const sorted = [...occurrences].sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime) || minutesOf(a.endTime) - minutesOf(b.endTime));
  const laneEnds: number[] = [];
  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const count = Math.max(1, ...cluster.map((p) => p.lane + 1));
    for (const p of cluster) p.laneCount = count;
    cluster = [];
  };
  for (const occurrence of sorted) {
    const start = minutesOf(occurrence.startTime);
    const end = minutesOf(occurrence.endTime);
    if (start >= clusterEnd) {
      closeCluster();
      laneEnds.length = 0;
    }
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    const p: Placed<T> = { occurrence, lane, laneCount: 1 };
    placed.push(p);
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, end);
  }
  closeCluster();
  return placed;
}

/** First and last minute shown: 08:00-21:00, widened to fit any class or availability, snapped to 15 minutes. */
export function gridBounds(occurrences: Pick<Occurrence, "startTime" | "endTime">[], days: AvailabilityDay[]): { startMinutes: number; endMinutes: number } {
  let start = DEFAULT_START;
  let end = DEFAULT_END;
  const widen = (s: string, e: string) => {
    start = Math.min(start, Math.floor(minutesOf(s) / ROW_MINUTES) * ROW_MINUTES);
    end = Math.max(end, Math.ceil(minutesOf(e) / ROW_MINUTES) * ROW_MINUTES);
  };
  for (const o of occurrences) widen(o.startTime, o.endTime);
  for (const d of days) for (const i of d.intervals) widen(i.start, i.end);
  return { startMinutes: start, endMinutes: end };
}
