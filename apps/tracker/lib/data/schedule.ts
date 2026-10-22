import { z } from "zod";
import type { ClassException } from "../domain/schedule/recurrence";
import type { Db } from "./client";
import type {
  AvailabilityExceptionRecord, LockedWrite, ScheduleStore, SeriesRecord, StoreError, StoreResult, SummaryRecord, WindowRecord, WriteContext,
} from "../scheduler/schedule-store";

/**
 * Scheduler storage over the signed-in user's Supabase client, so RLS decides
 * what each caller can see and write (migration 0010). Every row is parsed
 * with Zod (ADR 0017); `time` columns come back as HH:MM:SS and leave as HH:MM.
 */
export type ScheduleContext = { db: Db; orgId: string; userId: string };

const uuid = z.guid();
const hhmm = z.string().transform((t) => t.slice(0, 5));
const ts = z.string();

const WindowRow = z.object({
  id: uuid, notion_staff_id: uuid, weekday: z.number(), start_time: hhmm, end_time: hhmm,
  effective_from: z.string(), effective_until: z.string().nullable(), updated_at: ts,
}).transform((r): WindowRecord => ({
  id: r.id, staffId: r.notion_staff_id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time,
  effectiveFrom: r.effective_from, effectiveUntil: r.effective_until, updatedAt: r.updated_at,
}));
const AvailabilityExceptionRow = z.object({
  id: uuid, notion_staff_id: uuid, on_date: z.string(), kind: z.enum(["time_off", "extra"]),
  start_time: hhmm.nullable(), end_time: hhmm.nullable(), updated_at: ts,
}).transform((r): AvailabilityExceptionRecord => ({
  id: r.id, staffId: r.notion_staff_id, onDate: r.on_date, kind: r.kind, startTime: r.start_time, endTime: r.end_time, updatedAt: r.updated_at,
}));
const SeriesRow = z.object({
  id: uuid, notion_staff_id: uuid, notion_student_id: uuid, subject: z.string(), kind: z.enum(["one_off", "weekly"]),
  start_date: z.string(), start_time: hhmm, duration_minutes: z.number(), effective_until: z.string().nullable(),
  split_from: uuid.nullable(), updated_at: ts,
  // Migration 0019 (REQ-31).
  purpose: z.enum(["makeup", "trial", "extra"]).nullish(), makeup_for: uuid.nullish(),
}).transform((r): SeriesRecord => ({
  id: r.id, staffId: r.notion_staff_id, studentId: r.notion_student_id, subject: r.subject, kind: r.kind, startDate: r.start_date,
  startTime: r.start_time, durationMinutes: r.duration_minutes, effectiveUntil: r.effective_until, splitFrom: r.split_from, updatedAt: r.updated_at,
  purpose: r.purpose ?? null, makeupFor: r.makeup_for ?? null,
}));
const ExceptionRow = z.object({
  id: uuid, series_id: uuid, original_date: z.string(), kind: z.enum(["cancelled", "moved"]),
  new_date: z.string().nullable(), new_start_time: hhmm.nullable(),
}).transform((r): ClassException => ({
  id: r.id, seriesId: r.series_id, originalDate: r.original_date, kind: r.kind, newDate: r.new_date, newStartTime: r.new_start_time,
}));

const SummaryRow = z.object({
  id: uuid, notion_student_id: uuid, adopted_at: ts, adopted_from_text: z.string(), last_written_text: z.string().nullable(),
  last_written_at: ts.nullable(), sync_state: z.enum(["pending", "synced", "failed"]), last_error: z.string().nullable(),
  last_drift_text: z.string().nullable(),
  // Migration 0026 (REQ-34).
  last_drift_at: ts.nullish(), drift_seen_at: ts.nullish(),
}).transform((r): SummaryRecord => ({
  id: r.id, studentId: r.notion_student_id, adoptedAt: r.adopted_at, adoptedFromText: r.adopted_from_text, lastWrittenText: r.last_written_text,
  lastWrittenAt: r.last_written_at, syncState: r.sync_state, lastError: r.last_error, lastDriftText: r.last_drift_text,
  lastDriftAt: r.last_drift_at ?? null, driftSeenAt: r.drift_seen_at ?? null,
}));

const UNAVAILABLE: StoreError = { ok: false, status: 503, error: "unavailable" };
type PgError = { code?: string; message?: string };

const WriteOp = z.enum(["create", "move", "cancel", "edit_one_off", "split", "end_series"]);
const ContextRow = z.object({
  stamps: z.array(z.object({ kind: z.enum(["staff", "student"]), id: uuid, version: z.number() })),
  replay: z.object({ op: WriteOp, series_id: uuid.nullable(), result: SeriesRow }).nullable(),
}).transform((r): WriteContext => ({
  stamps: r.stamps,
  replay: r.replay && { op: r.replay.op, seriesId: r.replay.series_id, result: r.replay.result },
}));
const WriteRow = z.object({ replay: z.boolean(), result: SeriesRow });

/**
 * Errors raised by tracker.schedule_write (migration 0018) as store errors.
 * A lock timeout (55P03) or deadlock (40P01) is the one 503; the caller retries.
 */
function mapWriteError(error: PgError): StoreError | "duplicate" {
  if (error.code === "23505") return "duplicate";
  switch (error.message) {
    case "booking_changed": return { ok: false, status: 409, error: "booking_changed" };
    case "stale": return { ok: false, status: 409, error: "stale" };
    case "not_found": return { ok: false, status: 404, error: "not_found" };
    case "past_occurrence": return { ok: false, status: 422, error: "past_occurrence" };
    case "not_weekly": return { ok: false, status: 422, error: "not_weekly" };
    case "request_reused": return { ok: false, status: 400, error: "request_reused" };
    case "forbidden": return { ok: false, status: 403, error: "forbidden" };
    // Migration 0023: the occurrence is logged or marked, so it is frozen (REQ-39 AC9).
    case "has_outcome": return { ok: false, status: 409, error: "has_outcome" };
    default: return UNAVAILABLE;
  }
}

/** The p_args of tracker.schedule_write for one write. */
function writeArgs(w: LockedWrite): Record<string, unknown> {
  const position = (p: { status: string; date: string; startTime: string }) => ({ status: p.status, date: p.date, start_time: p.startTime });
  switch (w.op) {
    case "create": {
      const s = w.series;
      return {
        staff_id: s.staffId, student_id: s.studentId, subject: s.subject, kind: s.kind, start_date: s.startDate,
        start_time: s.startTime, duration_minutes: s.durationMinutes, effective_until: s.effectiveUntil,
        purpose: s.purpose ?? null, makeup_for: s.makeupFor ?? null,
      };
    }
    case "move":
      return {
        series_id: w.seriesId, original_date: w.originalDate, new_date: w.newDate, new_start_time: w.newStartTime,
        expected_updated_at: w.expectedUpdatedAt, expected_position: position(w.expectedPosition),
      };
    case "cancel":
      return { series_id: w.seriesId, original_date: w.originalDate, expected_updated_at: w.expectedUpdatedAt, expected_position: position(w.expectedPosition) };
    case "edit_one_off":
      return {
        series_id: w.seriesId, original_date: w.originalDate,
        ...(w.move ? { new_date: w.move.newDate, new_start_time: w.move.newStartTime } : {}),
        // undefined drops the key (unchanged); null stays and clears the column.
        fields: Object.fromEntries(Object.entries({
          staff_id: w.fields.staffId, subject: w.fields.subject, duration_minutes: w.fields.durationMinutes,
          purpose: w.fields.purpose, makeup_for: w.fields.makeupFor,
        }).filter(([, v]) => v !== undefined)),
        expected_updated_at: w.expectedUpdatedAt, expected_position: position(w.expectedPosition),
      };
    case "split": {
      const c = w.changes;
      return {
        series_id: w.seriesId, from_date: w.fromDate, expected_updated_at: w.expectedUpdatedAt,
        new_values: Object.fromEntries(Object.entries({
          staff_id: c.staffId, student_id: c.studentId, subject: c.subject, start_time: c.startTime, duration_minutes: c.durationMinutes, weekday: c.weekday,
        }).filter(([, v]) => v !== undefined)),
      };
    }
    case "end_series":
      return { series_id: w.seriesId, last_date: w.lastDate, expected_updated_at: w.expectedUpdatedAt };
  }
}

export function createScheduleStore(context: () => Promise<ScheduleContext | null>): ScheduleStore {
  const ctx = async () => {
    const c = await context();
    if (!c) throw new Error("scheduler storage unavailable");
    return c;
  };
  const guarded = async <T>(fn: () => Promise<StoreResult<T>>): Promise<StoreResult<T>> => {
    try {
      return await fn();
    } catch {
      return UNAVAILABLE;
    }
  };

  /** Insert once per (org, request_id); a retry reads back the first row. */
  async function insertOnce<T>(table: string, row: Record<string, unknown>, parse: (r: unknown) => T): Promise<StoreResult<T>> {
    const { db, orgId, userId } = await ctx();
    const full = { ...row, org_id: orgId, created_by: userId };
    const inserted = await db.tracker.from(table).upsert(full, { onConflict: "org_id,request_id", ignoreDuplicates: true }).select().maybeSingle();
    if (inserted.error) return UNAVAILABLE;
    if (inserted.data) return { ok: true, value: parse(inserted.data), created: true };
    const existing = await db.tracker.from(table).select().eq("org_id", orgId).eq("request_id", row.request_id as string).maybeSingle();
    return existing.data ? { ok: true, value: parse(existing.data), created: false } : UNAVAILABLE;
  }

  async function getOne<T>(table: string, id: string, parse: (r: unknown) => T): Promise<T | null> {
    const { db } = await ctx();
    const { data } = await db.tracker.from(table).select().eq("id", id).maybeSingle();
    return data ? parse(data) : null;
  }

  const store: ScheduleStore = {
    async listWindows(staffId) {
      const { db } = await ctx();
      const q = db.tracker.from("availability_windows").select();
      const { data } = await (staffId ? q.eq("notion_staff_id", staffId) : q);
      return z.array(WindowRow).parse(data ?? []);
    },
    async listAvailabilityExceptions(staffId, range) {
      const { db } = await ctx();
      const q = db.tracker.from("availability_exceptions").select().gte("on_date", range.from).lte("on_date", range.to);
      const { data } = await (staffId ? q.eq("notion_staff_id", staffId) : q);
      return z.array(AvailabilityExceptionRow).parse(data ?? []);
    },
    getWindow: (id) => getOne("availability_windows", id, (r) => WindowRow.parse(r)),
    createWindow: (i) => guarded(() => insertOnce("availability_windows", {
      request_id: i.requestId, notion_staff_id: i.staffId, weekday: i.weekday, start_time: i.startTime, end_time: i.endTime,
      effective_from: i.effectiveFrom, effective_until: i.effectiveUntil,
    }, (r) => WindowRow.parse(r))),
    updateWindow: (id, expected, c) => guarded(async () => {
      const { db } = await ctx();
      const patch: Record<string, unknown> = {};
      if (c.weekday !== undefined) patch.weekday = c.weekday;
      if (c.startTime !== undefined) patch.start_time = c.startTime;
      if (c.endTime !== undefined) patch.end_time = c.endTime;
      if (c.effectiveFrom !== undefined) patch.effective_from = c.effectiveFrom;
      if (c.effectiveUntil !== undefined) patch.effective_until = c.effectiveUntil;
      const { data, error } = await db.tracker.from("availability_windows").update(patch).eq("id", id).eq("updated_at", expected).select();
      if (error) return UNAVAILABLE;
      if (data?.length) return { ok: true, value: WindowRow.parse(data[0]), created: false };
      return (await store.getWindow(id)) ? { ok: false, status: 409, error: "stale" } : { ok: false, status: 404, error: "not_found" };
    }),
    async deleteWindow(id) {
      const { db } = await ctx();
      const { data } = await db.tracker.from("availability_windows").delete().eq("id", id).select("id");
      return (data?.length ?? 0) > 0;
    },
    getAvailabilityException: (id) => getOne("availability_exceptions", id, (r) => AvailabilityExceptionRow.parse(r)),
    createAvailabilityException: (i) => guarded(() => insertOnce("availability_exceptions", {
      request_id: i.requestId, notion_staff_id: i.staffId, on_date: i.onDate, kind: i.kind, start_time: i.startTime, end_time: i.endTime,
    }, (r) => AvailabilityExceptionRow.parse(r))),
    async deleteAvailabilityException(id) {
      const { db } = await ctx();
      const { data } = await db.tracker.from("availability_exceptions").delete().eq("id", id).select("id");
      return (data?.length ?? 0) > 0;
    },

    async listSeries(range, staffId) {
      const { db } = await ctx();
      let q = db.tracker.from("class_series").select().lte("start_date", range.to).or(`effective_until.is.null,effective_until.gte.${range.from}`);
      if (staffId) q = q.eq("notion_staff_id", staffId);
      const [seriesRes, excRes] = await Promise.all([
        q,
        db.tracker.from("class_exceptions").select().or(
          `and(original_date.gte.${range.from},original_date.lte.${range.to}),and(new_date.gte.${range.from},new_date.lte.${range.to})`,
        ),
      ]);
      const series = z.array(SeriesRow).parse(seriesRes.data ?? []);
      const exceptions = z.array(ExceptionRow).parse(excRes.data ?? []);
      // A series can reach the range only through a move from outside it.
      const have = new Set(series.map((s) => s.id));
      const extraIds = [...new Set(exceptions.filter((e) => e.kind === "moved" && !have.has(e.seriesId)).map((e) => e.seriesId))];
      if (extraIds.length) {
        let eq = db.tracker.from("class_series").select().in("id", extraIds);
        if (staffId) eq = eq.eq("notion_staff_id", staffId);
        series.push(...z.array(SeriesRow).parse((await eq).data ?? []));
      }
      const ids = new Set(series.map((s) => s.id));
      return { series, exceptions: exceptions.filter((e) => ids.has(e.seriesId)) };
    },
    getSeries: (id) => getOne("class_series", id, (r) => SeriesRow.parse(r)),
    async readWriteContext(requestId, keys) {
      const { db, orgId } = await ctx();
      const { data, error } = await db.tracker.rpc("schedule_write_context", { p_org_id: orgId, p_request_id: requestId, p_keys: keys });
      if (error) throw new Error("unavailable");
      return ContextRow.parse(data);
    },
    lockedWrite: (w) => guarded(async () => {
      const { db, orgId } = await ctx();
      const { data, error } = await db.tracker.rpc("schedule_write", {
        p_org_id: orgId, p_request_id: w.requestId, p_op: w.op, p_stamps: w.stamps, p_args: writeArgs(w),
      });
      if (error) {
        const mapped = mapWriteError(error);
        if (mapped !== "duplicate") return mapped;
        // A duplicate that got past the function's own claim: its first result, if recorded.
        const again = await store.readWriteContext(w.requestId, []);
        return again.replay ? { ok: true, value: again.replay.result, created: false } : UNAVAILABLE;
      }
      const r = WriteRow.parse(data);
      return { ok: true, value: r.result, created: !r.replay };
    }),

    // These three throw on any query error: an empty answer from a failed read would look like
    // "no classes" or "not adopted", and the summary sync would blank a billing field (REQ-4 review).
    async listSeriesForStudent(studentId) {
      const { db } = await ctx();
      const { data, error } = await db.tracker.from("class_series").select().eq("notion_student_id", studentId);
      if (error) throw new Error("unavailable");
      const series = z.array(SeriesRow).parse(data ?? []);
      if (series.length === 0) return { series, exceptions: [] };
      const exc = await db.tracker.from("class_exceptions").select().in("series_id", series.map((s) => s.id));
      if (exc.error) throw new Error("unavailable");
      return { series, exceptions: z.array(ExceptionRow).parse(exc.data ?? []) };
    },
    async getSummary(studentId) {
      const { db } = await ctx();
      const { data, error } = await db.tracker.from("schedule_summaries").select().eq("notion_student_id", studentId).maybeSingle();
      if (error) throw new Error("unavailable");
      return data ? SummaryRow.parse(data) : null;
    },
    async listSummaries() {
      const { db } = await ctx();
      const { data, error } = await db.tracker.from("schedule_summaries").select().order("adopted_at");
      if (error) throw new Error("unavailable");
      return z.array(SummaryRow).parse(data ?? []);
    },
    adoptStudent: (i) => guarded(async () => {
      const { db } = await ctx();
      const existing = await store.getSummary(i.studentId);
      if (existing) return { ok: true, value: existing, created: false };
      const { error } = await db.tracker.rpc("adopt_student_schedule", {
        p_student_id: i.studentId,
        p_source_text: i.sourceText,
        p_series: i.series.map((s) => ({
          request_id: s.requestId, staff_id: s.staffId, subject: s.subject, start_date: s.startDate, start_time: s.startTime, duration_minutes: s.durationMinutes,
        })),
      });
      if (error) return UNAVAILABLE;
      const made = await store.getSummary(i.studentId);
      return made ? { ok: true, value: made, created: true } : UNAVAILABLE;
    }),
    async markSummary(studentId, patch) {
      try {
        const { db } = await ctx();
        const fields: Record<string, unknown> = { sync_state: patch.syncState };
        if (patch.lastWrittenText !== undefined) {
          fields.last_written_text = patch.lastWrittenText;
          fields.last_written_at = new Date().toISOString();
        }
        if (patch.lastError !== undefined) fields.last_error = patch.lastError;
        if (patch.lastDriftText !== undefined) fields.last_drift_text = patch.lastDriftText;
        if (patch.lastDriftAt !== undefined) fields.last_drift_at = patch.lastDriftAt;
        const { data } = await db.tracker.from("schedule_summaries").update(fields).eq("notion_student_id", studentId).select("id");
        return (data?.length ?? 0) > 0;
      } catch {
        return false;
      }
    },
    // The posted drift time goes back as the exact string Postgres returned, never re-parsed,
    // so "not distinct from" holds to the microsecond (REQ-34 AC10).
    async markDriftSeen(items) {
      const { db } = await ctx();
      const seenAt = new Date().toISOString();
      const rows = (r: { data: unknown; error: unknown }) => {
        if (r.error) throw new Error("unavailable");
        return Array.isArray(r.data) ? r.data.length : 0;
      };
      const legacy = items.filter((i) => i.lastDriftAt === null).map((i) => i.studentId);
      const updates = [
        ...(legacy.length > 0
          ? [db.tracker.from("schedule_summaries").update({ drift_seen_at: seenAt }).in("notion_student_id", legacy).is("last_drift_at", null).not("last_drift_text", "is", null).select("id")]
          : []),
        ...items.filter((i) => i.lastDriftAt !== null).map((i) =>
          db.tracker.from("schedule_summaries").update({ drift_seen_at: seenAt }).eq("notion_student_id", i.studentId).eq("last_drift_at", i.lastDriftAt!).select("id")),
      ];
      return (await Promise.all(updates)).reduce((n, r) => n + rows(r), 0);
    },
  };
  return store;
}
