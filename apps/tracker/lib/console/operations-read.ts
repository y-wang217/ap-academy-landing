import { z } from "zod";
import { createOutcomeStore } from "../data/outcomes";
import type { AvailabilityException, AvailabilityWindow } from "../domain/schedule/availability";
import { LessonLinkError, type LessonRow } from "../domain/schedule/lesson-link";
import type { DateRange, OutcomeFact, StaffAvailability } from "../domain/schedule/operations";
import type { ClassException, ClassSeries } from "../domain/schedule/recurrence";
import type { OwnerViewer } from "./guard";

/**
 * The scheduler tables as Operations mode reads them (REQ-58). Select-only, on the owner's own
 * client, so RLS (is_org_owner) decides. Every row is parsed with Zod (ADR 0017) and any query
 * error throws, so a failed read never looks like "no classes" (unlike createScheduleStore,
 * whose reads drop errors). Notion Lessons comes in as a port built by providers.ts.
 */
export type ScheduleRead = { series: ClassSeries[]; exceptions: ClassException[] };
export type LessonsRead = { ok: true; rows: LessonRow[] } | { ok: false; code: "not_configured" | "lessons_not_ready" | "failed" };
/** Rows of Lessons dated in the range whose Class occurrence is empty; null when Notion is not configured. */
export type UnlinkedLessonsPort = ((range: DateRange, signal: AbortSignal) => Promise<LessonRow[]>) | null;

export type OperationsReader = {
  schedule(range: DateRange): Promise<ScheduleRead>;
  availability(range: DateRange): Promise<StaffAvailability[]>;
  outcomes(keys: { seriesId: string; originalDate: string }[]): Promise<OutcomeFact[]>;
  unlinkedLessons(range: DateRange, signal: AbortSignal): Promise<LessonsRead>;
};

export const SERIES_COLUMNS = "id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, effective_until, purpose, makeup_for";
export const EXCEPTION_COLUMNS = "id, series_id, original_date, kind, new_date, new_start_time";
export const WINDOW_COLUMNS = "notion_staff_id, weekday, start_time, end_time, effective_from, effective_until";
export const AVAILABILITY_EXCEPTION_COLUMNS = "notion_staff_id, on_date, kind, start_time, end_time";

const uuid = z.guid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().transform((t) => t.slice(0, 5));

const SeriesRow = z.object({
  id: uuid, notion_staff_id: uuid, notion_student_id: uuid, subject: z.string(), kind: z.enum(["one_off", "weekly"]),
  start_date: date, start_time: hhmm, duration_minutes: z.number().int().positive(), effective_until: date.nullable(),
  purpose: z.enum(["makeup", "trial", "extra"]).nullish(), makeup_for: uuid.nullish(),
}).transform((r): ClassSeries => ({
  id: r.id, staffId: r.notion_staff_id, studentId: r.notion_student_id, subject: r.subject, kind: r.kind, startDate: r.start_date,
  startTime: r.start_time, durationMinutes: r.duration_minutes, effectiveUntil: r.effective_until, purpose: r.purpose ?? null, makeupFor: r.makeup_for ?? null,
}));
const ExceptionRow = z.object({
  id: uuid, series_id: uuid, original_date: date, kind: z.enum(["cancelled", "moved"]), new_date: date.nullable(), new_start_time: hhmm.nullable(),
}).transform((r): ClassException => ({
  id: r.id, seriesId: r.series_id, originalDate: r.original_date, kind: r.kind, newDate: r.new_date, newStartTime: r.new_start_time,
}));
const WindowRow = z.object({
  notion_staff_id: uuid, weekday: z.number().int(), start_time: hhmm, end_time: hhmm, effective_from: date, effective_until: date.nullable(),
}).transform((r): AvailabilityWindow & { staffId: string } => ({
  staffId: r.notion_staff_id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time, effectiveFrom: r.effective_from, effectiveUntil: r.effective_until,
}));
const AvailabilityExceptionRow = z.object({
  notion_staff_id: uuid, on_date: date, kind: z.enum(["time_off", "extra"]), start_time: hhmm.nullable(), end_time: hhmm.nullable(),
}).transform((r): AvailabilityException & { staffId: string } => ({
  staffId: r.notion_staff_id, onDate: r.on_date, kind: r.kind, startTime: r.start_time, endTime: r.end_time,
}));

const fail = (error: unknown) => {
  if (error) throw new Error("unavailable");
};

export function createOperationsReader(viewer: OwnerViewer, lessons: UnlinkedLessonsPort): OperationsReader {
  const tracker = viewer.db.tracker;
  const orgId = viewer.orgId;
  return {
    async schedule(range) {
      const [seriesRes, excRes] = await Promise.all([
        tracker.from("class_series").select(SERIES_COLUMNS).eq("org_id", orgId).lte("start_date", range.to)
          .or(`effective_until.is.null,effective_until.gte.${range.from}`),
        tracker.from("class_exceptions").select(EXCEPTION_COLUMNS).eq("org_id", orgId).or(
          `and(original_date.gte.${range.from},original_date.lte.${range.to}),and(new_date.gte.${range.from},new_date.lte.${range.to})`,
        ),
      ]);
      fail(seriesRes.error);
      fail(excRes.error);
      const series = z.array(SeriesRow).parse(seriesRes.data ?? []);
      const exceptions = z.array(ExceptionRow).parse(excRes.data ?? []);
      // A series can reach the range only through a move from outside it.
      const have = new Set(series.map((s) => s.id));
      const extraIds = [...new Set(exceptions.filter((e) => e.kind === "moved" && !have.has(e.seriesId)).map((e) => e.seriesId))];
      if (extraIds.length) {
        const extra = await tracker.from("class_series").select(SERIES_COLUMNS).eq("org_id", orgId).in("id", extraIds);
        fail(extra.error);
        series.push(...z.array(SeriesRow).parse(extra.data ?? []));
      }
      const ids = new Set(series.map((s) => s.id));
      return { series, exceptions: exceptions.filter((e) => ids.has(e.seriesId)) };
    },

    async availability(range) {
      const [windowsRes, excRes] = await Promise.all([
        tracker.from("availability_windows").select(WINDOW_COLUMNS).eq("org_id", orgId),
        tracker.from("availability_exceptions").select(AVAILABILITY_EXCEPTION_COLUMNS).eq("org_id", orgId).gte("on_date", range.from).lte("on_date", range.to),
      ]);
      fail(windowsRes.error);
      fail(excRes.error);
      const byStaff = new Map<string, StaffAvailability>();
      const entry = (staffId: string) => byStaff.get(staffId) ?? byStaff.set(staffId, { staffId, windows: [], exceptions: [] }).get(staffId)!;
      for (const { staffId, ...w } of z.array(WindowRow).parse(windowsRes.data ?? [])) entry(staffId).windows.push(w);
      for (const { staffId, ...e } of z.array(AvailabilityExceptionRow).parse(excRes.data ?? [])) entry(staffId).exceptions.push(e);
      return [...byStaff.values()];
    },

    async outcomes(keys) {
      const store = createOutcomeStore(async () => ({ db: viewer.db, orgId, userId: viewer.userId }));
      const rows = await store.listForOccurrences(keys);
      return rows.map((r) => ({ seriesId: r.seriesId, originalDate: r.originalDate, outcome: r.outcome, notionLessonId: r.notionLessonId }));
    },

    async unlinkedLessons(range, signal) {
      if (!lessons) return { ok: false, code: "not_configured" };
      try {
        return { ok: true, rows: await lessons(range, signal) };
      } catch (e) {
        return { ok: false, code: e instanceof LessonLinkError && e.code === "lessons_not_ready" ? "lessons_not_ready" : "failed" };
      }
    },
  };
}
