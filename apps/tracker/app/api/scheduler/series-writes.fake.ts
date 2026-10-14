import type { ScheduleStore, SeriesRecord } from "../../../lib/scheduler/schedule-store";

/**
 * The two series writes added in REQ-7, with the database's semantics: the
 * version token must match, and every write moves it. Shared by the fake
 * stores in the route tests.
 */
export function seriesWrites(series: Map<string, SeriesRecord>, stampOf: () => string = () => "2026-10-14T15:00:00.000Z"): Pick<ScheduleStore, "endSeries" | "updateSeriesFields"> {
  const write = (id: string, expected: string, patch: Partial<SeriesRecord>) => {
    const s = series.get(id);
    if (!s) return { ok: false as const, status: 404 as const, error: "not_found" as const };
    if (s.updatedAt !== expected) return { ok: false as const, status: 409 as const, error: "stale" as const };
    const next = { ...s, ...patch, updatedAt: stampOf() };
    series.set(id, next);
    return { ok: true as const, value: next, created: false };
  };
  return {
    endSeries: async (id, lastDate, expected) => write(id, expected, { effectiveUntil: lastDate }),
    updateSeriesFields: async (id, expected, f) => write(id, expected, f),
  };
}
