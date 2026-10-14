import { z } from "zod";
import { computeAvailability } from "../domain/schedule/availability";
import { checkClassShape, checkOccurrenceEditable } from "../domain/schedule/edits";
import { expandOccurrences, isPatternDate, type ClassException } from "../domain/schedule/recurrence";
import { daysBetween, minutesOf } from "../domain/schedule/wallclock";
import { isActiveTeachingStaff } from "../domain/staff";
import type { StaffRecord } from "../notion/staff";
import { assertStaffAccess, requireScheduler, type Allowed, type Denial } from "./guard";
import type { HandlerDeps } from "./handlers";
import {
  AvailabilityExceptionResponse, AvailabilityResponse, OccurrencesResponseAdmin, OccurrencesResponseTeacher, SeriesResponse, WindowResponse,
} from "./schemas";
import type { ScheduleStore, SeriesRecord, StoreError } from "./schedule-store";
import { syncStudentSummary, type StudentsPort, type SyncResult } from "./summary-sync";
import { normaliseScheduleText } from "../domain/schedule/legacy-line";

/**
 * Handler dependencies plus storage and "today" (America/Toronto) as injected
 * inputs. `students` is the Notion side of the Weekly Schedule summary (REQ-4);
 * without it the class handlers write classes and touch nothing in Notion.
 */
export type ScheduleDeps = HandlerDeps & { store: ScheduleStore; today: () => string; students?: StudentsPort };

const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial) => send(d.status, d.body);
const bad = (error = "invalid_request") => send(400, { error });
const fromStore = (e: StoreError) => send(e.status, { error: e.error });
const MAX_RANGE_DAYS = 92;

const Guid = z.guid();
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).refine((s) => minutesOf(s) % 5 === 0);
const Token = z.string().min(10);

const Range = z.object({ from: IsoDate, to: IsoDate });
function parseRange(q: URLSearchParams) {
  const r = Range.safeParse({ from: q.get("from"), to: q.get("to") });
  if (!r.success || r.data.from > r.data.to || daysBetween(r.data.from, r.data.to) + 1 > MAX_RANGE_DAYS) return null;
  return r.data;
}

const WindowBody = z.strictObject({
  requestId: Guid, staffId: Guid, weekday: z.number().int().min(1).max(7), startTime: Hhmm, endTime: Hhmm,
  effectiveFrom: IsoDate, effectiveUntil: IsoDate.nullable().default(null),
}).refine((b) => minutesOf(b.endTime) > minutesOf(b.startTime) && (!b.effectiveUntil || b.effectiveUntil >= b.effectiveFrom));
const WindowPatch = z.strictObject({
  expectedUpdatedAt: Token, weekday: z.number().int().min(1).max(7).optional(), startTime: Hhmm.optional(), endTime: Hhmm.optional(),
  effectiveFrom: IsoDate.optional(), effectiveUntil: IsoDate.nullable().optional(),
});
const ExceptionBody = z.strictObject({
  requestId: Guid, staffId: Guid, onDate: IsoDate, kind: z.enum(["time_off", "extra"]),
  startTime: Hhmm.nullable().default(null), endTime: Hhmm.nullable().default(null),
}).refine((b) => (b.startTime === null) === (b.endTime === null) && (b.kind === "time_off" || b.startTime !== null)
  && (b.startTime === null || minutesOf(b.endTime!) > minutesOf(b.startTime)));
const ClassBody = z.strictObject({
  requestId: Guid, staffId: Guid, studentId: Guid, subject: z.string().trim().min(1).max(80), kind: z.enum(["one_off", "weekly"]),
  startDate: IsoDate, startTime: Hhmm, durationMinutes: z.number().int(), effectiveUntil: IsoDate.nullable().default(null),
}).refine((b) => b.kind === "weekly" || b.effectiveUntil === null);
const EditBody = z.strictObject({
  requestId: Guid, expectedUpdatedAt: Token, scope: z.enum(["this", "future"]).default("this"),
  changes: z.strictObject({
    date: IsoDate.optional(), startTime: Hhmm.optional(), staffId: Guid.optional(), studentId: Guid.optional(),
    subject: z.string().trim().min(1).max(80).optional(), durationMinutes: z.number().int().optional(), weekday: z.number().int().min(1).max(7).optional(),
  }).default({}),
});
const CancelBody = z.strictObject({ requestId: Guid, expectedUpdatedAt: Token, scope: z.enum(["this", "future"]).default("this") });

async function loadStaff(deps: ScheduleDeps): Promise<StaffRecord[] | null> {
  try {
    return await deps.fetchStaff();
  } catch {
    return null;
  }
}
async function activeTeacher(deps: ScheduleDeps, staffId: string): Promise<Response | null> {
  const list = await loadStaff(deps);
  if (!list) return send(503, { error: "scheduler_unavailable" });
  const found = list.find((s) => s.id === staffId);
  return found && isActiveTeachingStaff(found) ? null : send(422, { error: "invalid_staff" });
}
async function gate(deps: ScheduleDeps, scopes: ("admin" | "teacher")[]): Promise<Allowed | Response> {
  const g = requireScheduler(await deps.identity(), scopes);
  return g.ok ? g : deny(g);
}
const isResponse = (x: Allowed | Response): x is Response => x instanceof Response;

// Availability -------------------------------------------------------------------

export async function handleAvailability(deps: ScheduleDeps, q: URLSearchParams): Promise<Response> {
  const g = await gate(deps, ["admin", "teacher"]);
  if (isResponse(g)) return g;
  const range = parseRange(q);
  if (!range) return bad();
  const staffId = q.get("staffId") ?? (g.identity.scope === "teacher" ? g.identity.staff.id : null);
  if (!staffId || !Guid.safeParse(staffId).success) return bad();
  const access = assertStaffAccess(g.identity, staffId);
  if (!access.ok) return deny(access);
  const [windows, exceptions] = await Promise.all([deps.store.listWindows(staffId), deps.store.listAvailabilityExceptions(staffId, range)]);
  return send(200, AvailabilityResponse.parse({
    staffId, windows, exceptions, days: computeAvailability(windows, exceptions, range),
  }));
}

export async function handleCreateWindow(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = await gate(deps, ["admin", "teacher"]);
  if (isResponse(g)) return g;
  const p = WindowBody.safeParse(body);
  if (!p.success) return bad();
  const access = assertStaffAccess(g.identity, p.data.staffId);
  if (!access.ok) return deny(access);
  const r = await deps.store.createWindow(p.data);
  return r.ok ? send(r.created ? 201 : 200, WindowResponse.parse({ window: r.value })) : fromStore(r);
}

export async function handlePatchWindow(deps: ScheduleDeps, id: string, body: unknown): Promise<Response> {
  const g = await gate(deps, ["admin", "teacher"]);
  if (isResponse(g)) return g;
  const p = WindowPatch.safeParse(body);
  if (!Guid.safeParse(id).success || !p.success) return bad();
  const current = await deps.store.getWindow(id);
  if (!current) return send(404, { error: "not_found" });
  const access = assertStaffAccess(g.identity, current.staffId);
  if (!access.ok) return deny(access);
  const { expectedUpdatedAt, ...changes } = p.data;
  const merged = { ...current, ...changes };
  if (minutesOf(merged.endTime) <= minutesOf(merged.startTime) || (merged.effectiveUntil && merged.effectiveUntil < merged.effectiveFrom)) return bad();
  const r = await deps.store.updateWindow(id, expectedUpdatedAt, changes);
  return r.ok ? send(200, WindowResponse.parse({ window: r.value })) : fromStore(r);
}

export async function handleDeleteWindow(deps: ScheduleDeps, id: string): Promise<Response> {
  const g = await gate(deps, ["admin", "teacher"]);
  if (isResponse(g)) return g;
  if (!Guid.safeParse(id).success) return bad();
  const current = await deps.store.getWindow(id);
  if (!current) return send(404, { error: "not_found" });
  const access = assertStaffAccess(g.identity, current.staffId);
  if (!access.ok) return deny(access);
  return (await deps.store.deleteWindow(id)) ? send(200, { ok: true }) : send(404, { error: "not_found" });
}

export async function handleCreateAvailabilityException(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = await gate(deps, ["admin", "teacher"]);
  if (isResponse(g)) return g;
  const p = ExceptionBody.safeParse(body);
  if (!p.success) return bad();
  const access = assertStaffAccess(g.identity, p.data.staffId);
  if (!access.ok) return deny(access);
  const r = await deps.store.createAvailabilityException(p.data);
  return r.ok ? send(r.created ? 201 : 200, AvailabilityExceptionResponse.parse({ exception: r.value })) : fromStore(r);
}

export async function handleDeleteAvailabilityException(deps: ScheduleDeps, id: string): Promise<Response> {
  const g = await gate(deps, ["admin", "teacher"]);
  if (isResponse(g)) return g;
  if (!Guid.safeParse(id).success) return bad();
  const current = await deps.store.getAvailabilityException(id);
  if (!current) return send(404, { error: "not_found" });
  const access = assertStaffAccess(g.identity, current.staffId);
  if (!access.ok) return deny(access);
  return (await deps.store.deleteAvailabilityException(id)) ? send(200, { ok: true }) : send(404, { error: "not_found" });
}

// Classes ------------------------------------------------------------------------

const seriesBody = (s: SeriesRecord, summarySync?: SyncResult) => ({
  ...(summarySync ? { summarySync } : {}),
  series: {
    id: s.id, staffId: s.staffId, studentId: s.studentId, subject: s.subject, kind: s.kind, startDate: s.startDate,
    startTime: s.startTime, durationMinutes: s.durationMinutes, effectiveUntil: s.effectiveUntil, splitFrom: s.splitFrom, updatedAt: s.updatedAt,
  },
});

export async function handleOccurrences(deps: ScheduleDeps, q: URLSearchParams): Promise<Response> {
  const g = await gate(deps, ["admin", "teacher"]);
  if (isResponse(g)) return g;
  const range = parseRange(q);
  if (!range) return bad();
  const asked = q.get("staffId");
  if (asked !== null && !Guid.safeParse(asked).success) return bad();
  let staffId: string | undefined;
  if (g.identity.scope === "teacher") {
    staffId = asked ?? g.identity.staff.id;
    const access = assertStaffAccess(g.identity, staffId);
    if (!access.ok) return deny(access);
  } else {
    staffId = asked ?? undefined;
  }
  const { series, exceptions } = await deps.store.listSeries(range, staffId);
  const occurrences = expandOccurrences(series, exceptions, range);
  if (g.identity.scope === "teacher") return send(200, OccurrencesResponseTeacher.parse({ occurrences }));
  const stamp = new Map(series.map((s) => [s.id, s.updatedAt]));
  return send(200, OccurrencesResponseAdmin.parse({ occurrences: occurrences.map((o) => ({ ...o, seriesUpdatedAt: stamp.get(o.seriesId) })) }));
}

export async function handleCreateClass(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = await gate(deps, ["admin"]);
  if (isResponse(g)) return g;
  const p = ClassBody.safeParse(body);
  if (!p.success) return bad();
  const shape = checkClassShape(p.data.startTime, p.data.durationMinutes);
  if (!shape.ok) return send(shape.status, { error: shape.error });
  const notTeacher = await activeTeacher(deps, p.data.staffId);
  if (notTeacher) return notTeacher;
  const ready = await prepareStudent(deps, p.data.studentId);
  if (isRes(ready)) return ready;
  const r = await deps.store.createSeries(p.data);
  if (!r.ok) return fromStore(r);
  const summarySync = await syncStudents(deps, [p.data.studentId]);
  return send(r.created ? 201 : 200, SeriesResponse.parse(seriesBody(r.value, summarySync)));
}

/**
 * Once a student is adopted the scheduler owns their Weekly Schedule text.
 * A student who is not adopted yet is adopted here only if their legacy text
 * is empty; otherwise Charlie must run the import first, or the new class
 * would sit beside a legacy text that billing still reads (AC16).
 */
async function prepareStudent(deps: ScheduleDeps, studentId: string): Promise<Response | null> {
  if (!deps.students) return null;
  let record;
  try {
    if (await deps.store.getSummary(studentId)) return null;
    record = await deps.students.get(studentId);
  } catch {
    return send(503, { error: "scheduler_unavailable" });
  }
  if (!record) return send(422, { error: "invalid_student" });
  if (normaliseScheduleText(record.weeklySchedule).length > 0) return send(409, { error: "legacy_schedule_pending" });
  const adopted = await deps.store.adoptStudent({ studentId, sourceText: record.weeklySchedule, series: [] });
  return adopted.ok ? null : fromStore(adopted);
}

/** Regenerates the summary of each student; one "failed" wins, then "synced". Undefined when Notion is not wired in. */
async function syncStudents(deps: ScheduleDeps, studentIds: string[]): Promise<SyncResult | undefined> {
  if (!deps.students) return undefined;
  const results: SyncResult[] = [];
  for (const id of new Set(studentIds)) {
    results.push(await syncStudentSummary({ store: deps.store, students: deps.students, fetchStaff: deps.fetchStaff, today: deps.today }, id));
  }
  return results.includes("failed") ? "failed" : results.includes("synced") ? "synced" : "skipped";
}

async function loadOccurrence(deps: ScheduleDeps, seriesId: string, date: string) {
  if (!Guid.safeParse(seriesId).success || !IsoDate.safeParse(date).success) return bad();
  const series = await deps.store.getSeries(seriesId);
  if (!series || !isPatternDate(series, date)) return send(404, { error: "not_found" });
  const editable = checkOccurrenceEditable(date, deps.today());
  if (!editable.ok) return send(editable.status, { error: editable.error });
  return series;
}
const isRes = (x: unknown): x is Response => x instanceof Response;

/** PATCH: "this" writes a move exception; "future" splits the series at this occurrence. */
export async function handleEditOccurrence(deps: ScheduleDeps, seriesId: string, date: string, body: unknown): Promise<Response> {
  const g = await gate(deps, ["admin"]);
  if (isResponse(g)) return g;
  const p = EditBody.safeParse(body);
  if (!p.success) return bad();
  // A retried split must find its first result before any check on the old
  // series, which now ends before this date (AC8).
  if (p.data.scope === "future" && Guid.safeParse(seriesId).success) {
    const done = await deps.store.getSeriesByRequest(p.data.requestId);
    if (done && done.splitFrom === seriesId) return send(200, SeriesResponse.parse(seriesBody(done)));
  }
  const series = await loadOccurrence(deps, seriesId, date);
  if (isRes(series)) return series;
  const c = p.data.changes;

  if (p.data.scope === "future") {
    const shape = checkClassShape(c.startTime ?? series.startTime, c.durationMinutes ?? series.durationMinutes);
    if (!shape.ok) return send(shape.status, { error: shape.error });
    if (c.staffId) {
      const notTeacher = await activeTeacher(deps, c.staffId);
      if (notTeacher) return notTeacher;
    }
    if (c.studentId && c.studentId !== series.studentId) {
      const ready = await prepareStudent(deps, c.studentId);
      if (isRes(ready)) return ready;
    }
    const rest = { ...c, date: undefined };
    const r = await deps.store.split({ seriesId, fromDate: date, expectedUpdatedAt: p.data.expectedUpdatedAt, requestId: p.data.requestId, changes: rest });
    if (!r.ok) return fromStore(r);
    const summarySync = await syncStudents(deps, [series.studentId, r.value.studentId]);
    return send(200, SeriesResponse.parse(seriesBody(r.value, summarySync)));
  }

  if (series.updatedAt !== p.data.expectedUpdatedAt) return send(409, { error: "stale" });
  const newDate = c.date ?? date;
  const newStart = c.startTime ?? series.startTime;
  if (c.staffId || c.studentId || c.subject || c.durationMinutes || c.weekday) return bad("use_scope_future");
  const shape = checkClassShape(newStart, series.durationMinutes);
  if (!shape.ok) return send(shape.status, { error: shape.error });
  const exception: ClassException = { seriesId, originalDate: date, kind: "moved", newDate, newStartTime: newStart };
  const r = await deps.store.upsertException({ ...exception, requestId: p.data.requestId });
  return r.ok ? send(200, SeriesResponse.parse(seriesBody(series))) : fromStore(r);
}

/** DELETE: cancels this one occurrence. Ending a series from here is "future" via PATCH. */
export async function handleCancelOccurrence(deps: ScheduleDeps, seriesId: string, date: string, body: unknown): Promise<Response> {
  const g = await gate(deps, ["admin"]);
  if (isResponse(g)) return g;
  const p = CancelBody.safeParse(body);
  if (!p.success || p.data.scope !== "this") return bad();
  const series = await loadOccurrence(deps, seriesId, date);
  if (isRes(series)) return series;
  if (series.updatedAt !== p.data.expectedUpdatedAt) return send(409, { error: "stale" });
  const r = await deps.store.upsertException({ seriesId, originalDate: date, kind: "cancelled", newDate: null, newStartTime: null, requestId: p.data.requestId });
  return r.ok ? send(200, SeriesResponse.parse(seriesBody(series))) : fromStore(r);
}
