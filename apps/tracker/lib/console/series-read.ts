import { z } from "zod";
import type { Db } from "../data/client";
import type { Adoption, SeriesFact } from "../domain/schedule/net-new";
import { addDays } from "../domain/schedule/wallclock";

/**
 * The org's class series and adoptions as the north star reads them (REQ-56, tracker ADR 0068).
 * Select-only, on the owner's own client, so RLS decides what comes back. Every row is parsed with
 * Zod (ADR 0017) and any query error throws, so a failed read never looks like "no classes". The
 * window spans the prior week's Monday to this week's Sunday, so one read feeds both weeks.
 */
export type SeriesRead = { series: SeriesFact[]; adoptions: Adoption[] };

export const SERIES_COLUMNS = "id, notion_student_id, notion_staff_id, kind, purpose, start_date, effective_until, duration_minutes, split_from, created_at";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Row = z.object({
  id: z.guid(), notion_student_id: z.guid(), notion_staff_id: z.guid(), kind: z.enum(["weekly", "one_off"]),
  purpose: z.enum(["trial", "makeup", "extra"]).nullable(), start_date: date, effective_until: date.nullable(),
  duration_minutes: z.number().int().positive(), split_from: z.guid().nullable(), created_at: z.string(),
});
const AdoptionRow = z.object({ notion_student_id: z.guid(), adopted_at: z.string() });

export function createConsoleSeriesReader(tracker: Db["tracker"], orgId: string): (window: { from: string; to: string }) => Promise<SeriesRead> {
  return async (window) => {
    const [weekly, oneOff, adoptions] = await Promise.all([
      tracker.from("class_series").select(SERIES_COLUMNS).eq("org_id", orgId).eq("kind", "weekly").lte("start_date", window.to)
        .or(`effective_until.is.null,effective_until.gte.${addDays(window.from, -1)}`),
      tracker.from("class_series").select(SERIES_COLUMNS).eq("org_id", orgId).eq("kind", "one_off").gte("start_date", window.from).lte("start_date", window.to),
      tracker.from("schedule_summaries").select("notion_student_id, adopted_at").eq("org_id", orgId),
    ]);
    if (weekly.error || oneOff.error || adoptions.error) throw new Error("unavailable");
    const rows = z.array(Row).parse([...(weekly.data ?? []), ...(oneOff.data ?? [])]);
    return {
      series: rows.map((r) => ({
        id: r.id, studentId: r.notion_student_id, staffId: r.notion_staff_id, kind: r.kind, purpose: r.purpose, startDate: r.start_date,
        effectiveUntil: r.effective_until, durationMinutes: r.duration_minutes, splitFrom: r.split_from, createdAt: r.created_at,
      })),
      adoptions: z.array(AdoptionRow).parse(adoptions.data ?? []).map((a) => ({ studentId: a.notion_student_id, adoptedAt: a.adopted_at })),
    };
  };
}
