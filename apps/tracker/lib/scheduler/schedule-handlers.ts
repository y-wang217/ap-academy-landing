import { z } from "zod";
import { computeAvailability } from "../domain/schedule/availability";
import { bookingWindow, checkBooking, MAX_PROBLEMS } from "../domain/schedule/booking";
import { checkClassShape, checkNotPast, checkOccurrenceEditable } from "../domain/schedule/edits";
import { expandOccurrences, isPatternDate, planSplit, type ClassException, type ClassSeries, type Occurrence } from "../domain/schedule/recurrence";
import { addDays, daysBetween, isoWeekday, minutesOf } from "../domain/schedule/wallclock";
import { weekOf, weekTotals } from "../domain/schedule/week";
import { isActiveTeachingStaff } from "../domain/staff";
import type { StaffRecord } from "../notion/staff";
import { assertStaffAccess, requireScheduler, toAdminStaff, toTeacherStaff, type Allowed, type Denial } from "./guard";
import type { HandlerDeps } from "./handlers";
import { findConflicts, type StaffAvailability } from "../domain/schedule/conflicts";
import {
  AvailabilityExceptionResponse, AvailabilityResponse, BookingConflictResponse, ConflictsResponseAdmin, ConflictsResponseTeacher, OccurrencesResponseAdmin, OccurrencesResponseTeacher, SeriesResponse, WeekResponseAdmin, WeekResponseTeacher, WindowResponse,
} from "./schemas";
import type { BookingKey, BookingStamp, ScheduleStore, SeriesRecord, StoreError, StoreResult, WriteOp } from "./schedule-store";
import { syncStudentSummary, type StudentsPort, type SyncResult } from "./summary-sync";
import { ensureDailyTask, type DailyTaskDeps } from "./daily-task";
import { normaliseScheduleText } from "../domain/schedule/legacy-line";

/**
 * Handler dependencies plus storage and "today" (America/Toronto) as injected
 * inputs. `students` is the Notion side of the Weekly Schedule summary (REQ-4);
 * without it the class handlers write classes and touch nothing in Notion.
 */
export type ScheduleDeps = HandlerDeps & {
  store: ScheduleStore;
  today: () => string;
  students?: StudentsPort;
  /** Student names for the calendar (REQ-6). Names only. Absent when Notion is not wired in. */
  studentNames?: () => Promise<Map<string, string>>;
  /** Today's "Text teachers their schedules" task (REQ-8). Absent when Notion's Work database is not wired in. */
  dailyTask?: DailyTaskDeps;
};

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
// expectedDate / expectedStartTime: where the client last saw the occurrence. A move writes no series
// version, so this is what makes two tabs moving one occurrence a 409 instead of a silent overwrite.
const Seen = { expectedDate: IsoDate.optional(), expectedStartTime: Hhmm.optional() };
const EditBody = z.strictObject({
  requestId: Guid, expectedUpdatedAt: Token, scope: z.enum(["this", "future"]).default("this"), ...Seen,
  changes: z.strictObject({
    date: IsoDate.optional(), startTime: Hhmm.optional(), staffId: Guid.optional(), studentId: Guid.optional(),
    subject: z.string().trim().min(1).max(80).optional(), durationMinutes: z.number().int().optional(), weekday: z.number().int().min(1).max(7).optional(),
  }).default({}),
});
const CancelBody = z.strictObject({ requestId: Guid, expectedUpdatedAt: Token, scope: z.enum(["this", "future"]).default("this"), ...Seen });

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

// Conflicts ----------------------------------------------------------------------

/**
 * Upcoming classes outside their teacher's availability, computed on read and
 * never stored. Read-only: no class or availability write happens here. The
 * conflicts page, the owner's home badge and the route all share this.
 */
export async function loadConflicts(
  deps: ScheduleDeps,
  identity: Allowed["identity"],
  range: { from: string; to: string },
  staffId?: string,
) {
  const scope = identity.scope === "teacher" ? identity.staff.id : staffId;
  const { series, exceptions } = await deps.store.listSeries(range, scope);
  const occurrences = expandOccurrences(series, exceptions, range);
  const [windows, avExceptions] = await Promise.all([
    deps.store.listWindows(scope),
    deps.store.listAvailabilityExceptions(scope, range),
  ]);
  const availability = new Map<string, StaffAvailability>();
  for (const id of new Set(series.map((s) => s.staffId))) {
    const ex = avExceptions.filter((e) => e.staffId === id);
    availability.set(id, { days: computeAvailability(windows.filter((w) => w.staffId === id), ex, range), exceptions: ex });
  }
  const { conflicts, notEntered } = findConflicts(occurrences, availability, deps.today());
  const stamp = new Map(series.map((s) => [s.id, s.updatedAt]));
  return {
    conflicts: conflicts.map((c) => ({ ...c.occurrence, reason: c.reason, seriesUpdatedAt: stamp.get(c.occurrence.seriesId) })),
    notEntered,
  };
}

export async function handleConflicts(deps: ScheduleDeps, q: URLSearchParams): Promise<Response> {
  const g = await gate(deps, ["admin", "teacher"]);
  if (isResponse(g)) return g;
  const range = parseRange(q);
  if (!range) return bad();
  const asked = q.get("staffId");
  if (asked !== null && !Guid.safeParse(asked).success) return bad();
  if (asked !== null) {
    const access = assertStaffAccess(g.identity, asked);
    if (!access.ok) return deny(access);
  }
  const { conflicts, notEntered } = await loadConflicts(deps, g.identity, range, asked ?? undefined);
  if (g.identity.scope === "teacher") {
    return send(200, ConflictsResponseTeacher.parse({ conflicts: conflicts.map(({ seriesUpdatedAt, ...rest }) => (void seriesUpdatedAt, rest)) }));
  }
  return send(200, ConflictsResponseAdmin.parse({ conflicts, notEntered }));
}

// Week ----------------------------------------------------------------------------

export type WeekQuery = { date?: string | null; staffId?: string | null; view?: string | null };
export type WeekResult =
  | { ok: true; body: z.infer<typeof WeekResponseAdmin> | z.infer<typeof WeekResponseTeacher> }
  | { ok: false; status: number; error: string };
const fail = (status: number, error: string): WeekResult => ({ ok: false, status, error });

/**
 * One week of classes, availability and totals, read-only. Teachers get their
 * own week only; Charlie can pick a teacher or ask for all of them. Access is
 * checked before the store is touched. Student names are looked up after the
 * occurrences are chosen, and only for the students in them. The page and the
 * route both call this, so the page's check is the server's check.
 */
export async function loadWeek(deps: ScheduleDeps, query: WeekQuery): Promise<WeekResult> {
  const g = requireScheduler(await deps.identity(), ["admin", "teacher"]);
  if (!g.ok) return fail(g.status, g.body.error);
  const { identity } = g;

  const today = deps.today();
  const date = query.date ?? today;
  if (!IsoDate.safeParse(date).success) return fail(400, "invalid_request");
  const asked = query.staffId ?? null;
  if (asked !== null && !Guid.safeParse(asked).success) return fail(400, "invalid_request");
  if (query.view != null && query.view !== "all") return fail(400, "invalid_request");
  const all = query.view === "all";

  if (identity.scope === "teacher" && (all || (asked !== null && asked !== identity.staff.id))) return fail(403, "forbidden");

  let staff: StaffRecord[];
  if (identity.scope === "teacher") {
    staff = [identity.staff];
  } else {
    const list = await loadStaff(deps);
    if (!list) return fail(503, "scheduler_unavailable");
    const teachers = list.filter(isActiveTeachingStaff).sort((a, b) => a.name.localeCompare(b.name));
    if (all) staff = teachers;
    else if (asked !== null) {
      const found = teachers.find((t) => t.id === asked);
      if (!found) return fail(422, "invalid_staff");
      staff = [found];
    } else {
      const own = identity.staff && teachers.find((t) => t.id === identity.staff!.id);
      staff = own ? [own] : teachers.slice(0, 1);
    }
  }

  const range = weekOf(date);
  const scope = all ? undefined : staff[0]?.id;
  if (!all && scope === undefined) return { ok: true, body: WeekResponseAdmin.parse({ weekStart: range.from, today, namesLoaded: true, teachers: [] }) };
  const [{ series, exceptions }, windows, avExceptions] = await Promise.all([
    deps.store.listSeries(range, scope),
    deps.store.listWindows(scope),
    deps.store.listAvailabilityExceptions(scope, range),
  ]);

  const perTeacher = staff.map((member) => {
    const mine = series.filter((s) => s.staffId === member.id);
    const ids = new Set(mine.map((s) => s.id));
    const ex = avExceptions.filter((e) => e.staffId === member.id);
    const days = computeAvailability(windows.filter((w) => w.staffId === member.id), ex, range);
    const occurrences = expandOccurrences(mine, exceptions.filter((e) => ids.has(e.seriesId)), range);
    const { conflicts } = findConflicts(occurrences, new Map([[member.id, { days, exceptions: ex }]]), today);
    return { member, mine, days, occurrences, conflictOf: new Map(conflicts.map((c) => [c.occurrence.occurrenceKey, c.reason])) };
  });

  let names: Map<string, string> | null = new Map();
  const wanted = new Set(perTeacher.flatMap((t) => t.occurrences.map((o) => o.studentId)));
  if (wanted.size > 0) {
    try {
      names = deps.studentNames ? await deps.studentNames() : null;
    } catch {
      names = null;
    }
  }

  const rows = perTeacher.map((t) => {
    const stamp = new Map(t.mine.map((s) => [s.id, s.updatedAt]));
    return {
      member: t.member,
      days: t.days,
      totals: weekTotals(t.occurrences, t.days),
      occurrences: t.occurrences.map((o) => ({
        ...o,
        studentName: names?.get(o.studentId) ?? null,
        conflict: t.conflictOf.get(o.occurrenceKey) ?? null,
        seriesUpdatedAt: stamp.get(o.seriesId),
      })),
    };
  });
  const head = { weekStart: range.from, today, namesLoaded: names !== null };

  if (identity.scope === "teacher") {
    return {
      ok: true,
      body: WeekResponseTeacher.parse({
        ...head,
        teachers: rows.map((r) => ({
          staff: toTeacherStaff(r.member), days: r.days, totals: r.totals,
          occurrences: r.occurrences.map(({ seriesUpdatedAt, ...rest }) => (void seriesUpdatedAt, rest)),
        })),
      }),
    };
  }
  return { ok: true, body: WeekResponseAdmin.parse({ ...head, teachers: rows.map((r) => ({ staff: toAdminStaff(r.member), days: r.days, totals: r.totals, occurrences: r.occurrences })) }) };
}

export async function handleWeek(deps: ScheduleDeps, q: URLSearchParams): Promise<Response> {
  const r = await loadWeek(deps, { date: q.get("date"), staffId: q.get("staffId"), view: q.get("view") });
  return r.ok ? send(200, r.body) : send(r.status, { error: r.error });
}

// Classes ------------------------------------------------------------------------

const seriesBody = (s: SeriesRecord, summarySync?: SyncResult, dailyTask?: DailyTaskOutcomeValue) => ({
  ...(summarySync ? { summarySync } : {}),
  ...(dailyTask ? { dailyTask } : {}),
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
  const past = checkNotPast(p.data.startDate, deps.today());
  if (!past.ok) return send(past.status, { error: past.error });
  const shape = checkClassShape(p.data.startTime, p.data.durationMinutes);
  if (!shape.ok) return send(shape.status, { error: shape.error });
  const notTeacher = await activeTeacher(deps, p.data.staffId);
  if (notTeacher) return notTeacher;
  const { requestId, ...fields } = p.data;
  // A retry finds its first result in the write context, before the clash check, which would otherwise see the class it already made.
  const written = await bookUnderStamps(deps, { requestId, keys: keysOf(fields), ops: ["create"] }, async (stamps) => {
    const blocked = await validateBooking(deps, {
      series: { id: NEW_ID, ...fields }, exceptions: [], window: bookingWindow(fields.startDate, deps.today(), fields.effectiveUntil),
      checkAvailability: true,
    });
    if (blocked) return blocked;
    const ready = await prepareStudent(deps, fields.studentId);
    if (isRes(ready)) return ready;
    return deps.store.lockedWrite({ op: "create", requestId, stamps, series: fields });
  });
  if (isRes(written)) return written;
  const summarySync = await syncStudents(deps, [written.series.studentId]);
  return send(written.replayed ? 200 : 201, SeriesResponse.parse(seriesBody(written.series, summarySync, await refreshToday(deps))));
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

type DailyTaskOutcomeValue = "updated" | "unchanged" | "skipped" | "failed";

/**
 * After a class write: refresh today's task if it exists (never creates it).
 * The class write has already succeeded, so a failure here only shows up as
 * `dailyTask: "failed"`. A lease held by another run means this change was not
 * applied, so it reads as failed too, and Retry or the hourly run catches up.
 */
async function refreshToday(deps: ScheduleDeps): Promise<DailyTaskOutcomeValue | undefined> {
  if (!deps.dailyTask) return undefined;
  try {
    const r = await ensureDailyTask(deps.dailyTask, { date: deps.today(), mode: "refresh_only" });
    return r === "updated" || r === "unchanged" || r === "skipped" ? r : "failed";
  } catch {
    return "failed";
  }
}

const NEW_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Clash and availability check for a booking that has not been written yet.
 * `series` and `exceptions` describe the class as it would be afterwards;
 * `window` is the dates to check (bookingWindow); `exclude` drops the class's
 * own current occurrences from "other classes" so it never clashes with itself.
 * Returns the 422 to send, or null when it is fine. Runs before any write.
 */
async function validateBooking(deps: ScheduleDeps, input: {
  series: ClassSeries;
  exceptions: ClassException[];
  window: { from: string; to: string } | null;
  checkAvailability: boolean;
  exclude?: (o: Occurrence) => boolean;
  /** Narrows the candidates to the occurrence being changed: a series' other dates in the window are not part of the change. */
  only?: (o: Occurrence) => boolean;
}): Promise<Response | null> {
  const { series, window } = input;
  if (!window) return null;
  const today = deps.today();
  const candidates = expandOccurrences([series], input.exceptions, window).filter((o) => o.status !== "cancelled" && o.date >= today && (input.only?.(o) ?? true));
  if (candidates.length === 0) return null;
  try {
    const [byTeacher, byStudent] = await Promise.all([deps.store.listSeries(window, series.staffId), deps.store.listSeriesForStudent(series.studentId)]);
    const all = new Map([...byTeacher.series, ...byStudent.series].map((s) => [s.id, s]));
    const others = expandOccurrences([...all.values()], [...byTeacher.exceptions, ...byStudent.exceptions], window).filter((o) => !input.exclude?.(o));
    const availability = new Map<string, StaffAvailability>();
    if (input.checkAvailability) {
      const [windows, exceptions] = await Promise.all([deps.store.listWindows(series.staffId), deps.store.listAvailabilityExceptions(series.staffId, window)]);
      availability.set(series.staffId, { days: computeAvailability(windows, exceptions, window), exceptions });
    }
    const problems = checkBooking({ candidates, others, availability, checkAvailability: input.checkAvailability, today });
    if (problems.length === 0) return null;
    return send(422, BookingConflictResponse.parse({
      error: "booking_conflict", problems: problems.slice(0, MAX_PROBLEMS), more: Math.max(0, problems.length - MAX_PROBLEMS),
    }));
  } catch {
    return send(503, { error: "scheduler_unavailable" });
  }
}

/** Where an occurrence stands now: its exception, if any, else the pattern. */
async function currentPosition(deps: ScheduleDeps, series: SeriesRecord, date: string) {
  const { exceptions } = await deps.store.listSeries({ from: date, to: date }, series.staffId);
  const e = exceptions.find((x) => x.seriesId === series.id && x.originalDate === date);
  if (e?.kind === "moved" && e.newDate && e.newStartTime) return { status: "moved" as const, date: e.newDate, startTime: e.newStartTime };
  if (e?.kind === "cancelled") return { status: "cancelled" as const, date, startTime: series.startTime };
  return { status: "scheduled" as const, date, startTime: series.startTime };
}

/** The occurrence on `date` exists in the series and can still be changed; else the response to send. */
function checkOccurrence(deps: ScheduleDeps, series: SeriesRecord, date: string): Response | null {
  if (!isPatternDate(series, date)) return send(404, { error: "not_found" });
  const editable = checkOccurrenceEditable(date, deps.today());
  return editable.ok ? null : send(editable.status, { error: editable.error });
}
const isRes = (x: unknown): x is Response => x instanceof Response;
const unavailable = () => send(503, { error: "scheduler_unavailable" });

/** The teacher and student keys of a class write, without repeats. */
function keysOf(...people: { staffId?: string; studentId?: string }[]): BookingKey[] {
  const keys = new Map<string, BookingKey>();
  for (const p of people) {
    if (p.staffId) keys.set(`staff:${p.staffId}`, { kind: "staff", id: p.staffId });
    if (p.studentId) keys.set(`student:${p.studentId}`, { kind: "student", id: p.studentId });
  }
  return [...keys.values()];
}

type Written = { series: SeriesRecord; replayed: boolean };

/**
 * Every class write goes through here (tracker ADR 0050). Read the booking
 * stamps of the people the write touches, and any earlier result for this
 * request ID; then `attempt` runs the existing checks and writes under those
 * stamps. If anything the checks read changed in between, the database refuses
 * with `booking_changed` and the whole attempt runs once more on fresh data. A
 * second refusal is 409 stale. Any 503 from storage is `scheduler_unavailable`.
 */
async function bookUnderStamps(
  deps: ScheduleDeps,
  w: { requestId: string; keys: BookingKey[]; ops: WriteOp[]; target?: string },
  attempt: (stamps: BookingStamp[]) => Promise<Response | StoreResult<SeriesRecord>>,
): Promise<Response | Written> {
  for (let round = 1; ; round++) {
    let context;
    try {
      context = await deps.store.readWriteContext(w.requestId, w.keys);
    } catch {
      return unavailable();
    }
    if (context.replay) {
      const r = context.replay;
      if (!w.ops.includes(r.op) || (w.target !== undefined && r.seriesId !== w.target)) return bad();
      return { series: r.result, replayed: true };
    }
    const r = await attempt(context.stamps);
    if (isRes(r)) return r;
    if (r.ok) return { series: r.value, replayed: !r.created };
    if (r.error === "booking_changed") {
      if (round < 2) continue;
      return send(409, { error: "stale" });
    }
    if (r.error === "request_reused") return bad();
    if (r.status === 503) return unavailable();
    return fromStore(r);
  }
}

/**
 * PATCH: "this" moves one occurrence (and, on a one-off, may change its teacher, subject and duration);
 * "future" splits the series at this occurrence, which is the only series edit. Every change that could
 * clash is checked before the write, and the write refuses if anything the check read has changed since.
 */
export async function handleEditOccurrence(deps: ScheduleDeps, seriesId: string, date: string, body: unknown): Promise<Response> {
  const g = await gate(deps, ["admin"]);
  if (isResponse(g)) return g;
  const p = EditBody.safeParse(body);
  if (!p.success) return bad();
  if (!Guid.safeParse(seriesId).success || !IsoDate.safeParse(date).success) return bad();
  // Read once to learn whose bookings the write touches. A change to this row
  // after this read is caught by the version check inside the locked write.
  const series = await deps.store.getSeries(seriesId).catch(() => "unavailable" as const);
  if (series === "unavailable") return unavailable();
  if (!series) return send(404, { error: "not_found" });
  const c = p.data.changes;
  const { requestId, expectedUpdatedAt } = p.data;

  if (p.data.scope === "future") {
    // A retried split finds its first result before the pattern-date check, which would 404 now that the old series ends before this date.
    const written = await bookUnderStamps(deps, { requestId, keys: keysOf(series, { staffId: c.staffId, studentId: c.studentId }), ops: ["split"], target: seriesId },
      (stamps) => attemptSplit(deps, series, date, p.data, stamps));
    if (isRes(written)) return written;
    if (written.replayed) return send(200, SeriesResponse.parse(seriesBody(written.series)));
    const summarySync = await syncStudents(deps, [series.studentId, written.series.studentId]);
    return send(200, SeriesResponse.parse(seriesBody(written.series, summarySync, await refreshToday(deps))));
  }

  const written = await bookUnderStamps(deps, { requestId, keys: keysOf(series, { staffId: c.staffId }), ops: ["move", "edit_one_off"], target: seriesId }, async (stamps) => {
    const closed = checkOccurrence(deps, series, date);
    if (closed) return closed;
    let now;
    try {
      now = await currentPosition(deps, series, date);
    } catch {
      return unavailable();
    }
    if (stalePosition(p.data, now)) return send(409, { error: "stale" });
    if (series.updatedAt !== expectedUpdatedAt) return send(409, { error: "stale" });
    const oneOff = series.kind === "one_off";
    if (c.studentId || c.weekday || (!oneOff && (c.staffId || c.subject || c.durationMinutes))) return bad("use_scope_future");
    const newDate = c.date ?? now.date;
    const newStart = c.startTime ?? now.startTime;
    const duration = c.durationMinutes ?? series.durationMinutes;
    const shape = checkClassShape(newStart, duration);
    if (!shape.ok) return send(shape.status, { error: shape.error });
    if (c.staffId && c.staffId !== series.staffId) {
      const notTeacher = await activeTeacher(deps, c.staffId);
      if (notTeacher) return notTeacher;
    }
    if (newDate < deps.today()) return send(422, { error: "past_occurrence" });

    const moves = newDate !== now.date || newStart !== now.startTime;
    const fields = {
      ...(c.staffId && c.staffId !== series.staffId ? { staffId: c.staffId } : {}),
      ...(c.subject && c.subject !== series.subject ? { subject: c.subject } : {}),
      ...(c.durationMinutes && c.durationMinutes !== series.durationMinutes ? { durationMinutes: c.durationMinutes } : {}),
    };
    if (!moves && Object.keys(fields).length === 0) return send(200, SeriesResponse.parse(seriesBody(series)));
    const exception: ClassException = { seriesId, originalDate: date, kind: "moved", newDate, newStartTime: newStart };
    const asked = oneOff ? { ...series, ...fields } : series;
    const retimed = moves || fields.staffId !== undefined || fields.durationMinutes !== undefined;
    const blocked = await validateBooking(deps, {
      // An already-moved class keeps its move when only its teacher or length changes, so it is checked where it now sits.
      series: asked, exceptions: moves || now.status === "moved" ? [exception] : [], window: { from: newDate, to: newDate },
      checkAvailability: retimed, exclude: (o) => o.seriesId === seriesId && o.originalDate === date,
      // Moving 10-19 to Monday 10-26 must not also test the unmoved 10-26 occurrence against itself.
      only: (o) => o.originalDate === date,
    });
    if (blocked) return blocked;

    // One transaction: the exception and the series fields change together or not at all.
    const seen = { requestId, stamps, seriesId, expectedUpdatedAt, originalDate: date, expectedPosition: now };
    if (oneOff && Object.keys(fields).length > 0) {
      return deps.store.lockedWrite({ ...seen, op: "edit_one_off", move: moves ? { newDate, newStartTime: newStart } : null, fields });
    }
    return deps.store.lockedWrite({ ...seen, op: "move", newDate, newStartTime: newStart });
  });
  if (isRes(written)) return written;
  return send(200, SeriesResponse.parse(seriesBody(written.series, undefined, await refreshToday(deps))));
}

/** "This class and future": the checks of a split, then the locked write. */
async function attemptSplit(
  deps: ScheduleDeps, series: SeriesRecord, date: string,
  body: { requestId: string; expectedUpdatedAt: string; changes: z.infer<typeof EditBody>["changes"] } & Seen,
  stamps: BookingStamp[],
): Promise<Response | StoreResult<SeriesRecord>> {
  const closed = checkOccurrence(deps, series, date);
  if (closed) return closed;
  const c = body.changes;
  let now;
  try {
    now = await currentPosition(deps, series, date);
  } catch {
    return unavailable();
  }
  if (stalePosition(body, now)) return send(409, { error: "stale" });
  if (now.status === "moved") return send(422, { error: "moved_occurrence" });
  const shape = checkClassShape(c.startTime ?? series.startTime, c.durationMinutes ?? series.durationMinutes);
  if (!shape.ok) return send(shape.status, { error: shape.error });
  if (c.staffId) {
    const notTeacher = await activeTeacher(deps, c.staffId);
    if (notTeacher) return notTeacher;
  }
  const { date: _ignored, ...rest } = c;
  void _ignored;
  let exceptions: ClassException[];
  try {
    exceptions = (await deps.store.listSeriesForStudent(series.studentId)).exceptions.filter((e) => e.seriesId === series.id);
  } catch {
    return unavailable();
  }
  const plan = planSplit(series, exceptions, date, rest, NEW_ID);
  const retimed =
    (c.weekday !== undefined && c.weekday !== isoWeekday(date)) ||
    (c.startTime !== undefined && c.startTime !== series.startTime) ||
    (c.durationMinutes !== undefined && c.durationMinutes !== series.durationMinutes) ||
    (c.staffId !== undefined && c.staffId !== series.staffId);
  const blocked = await validateBooking(deps, {
    series: plan.newSeries, exceptions: plan.exceptions, window: bookingWindow(plan.newSeries.startDate, deps.today(), plan.newSeries.effectiveUntil),
    checkAvailability: retimed, exclude: (o) => o.seriesId === series.id && o.originalDate >= date,
  });
  if (blocked) return blocked;
  if (c.studentId && c.studentId !== series.studentId) {
    const ready = await prepareStudent(deps, c.studentId);
    if (isRes(ready)) return ready;
  }
  return deps.store.lockedWrite({
    op: "split", requestId: body.requestId, stamps, seriesId: series.id, expectedUpdatedAt: body.expectedUpdatedAt, fromDate: date, changes: rest,
  });
}

type Seen = { expectedDate?: string; expectedStartTime?: string };
/** The client's picture of where the occurrence is no longer matches the server's (AC9). */
const stalePosition = (seen: Seen, now: { date: string; startTime: string }) =>
  (seen.expectedDate !== undefined && seen.expectedDate !== now.date) || (seen.expectedStartTime !== undefined && seen.expectedStartTime !== now.startTime);

/** DELETE: "this" cancels one occurrence; "future" ends a weekly series the day before it (a one-off treats it as "this"). */
export async function handleCancelOccurrence(deps: ScheduleDeps, seriesId: string, date: string, body: unknown): Promise<Response> {
  const g = await gate(deps, ["admin"]);
  if (isResponse(g)) return g;
  const p = CancelBody.safeParse(body);
  if (!p.success) return bad();
  if (!Guid.safeParse(seriesId).success || !IsoDate.safeParse(date).success) return bad();
  const series = await deps.store.getSeries(seriesId).catch(() => "unavailable" as const);
  if (series === "unavailable") return unavailable();
  if (!series) return send(404, { error: "not_found" });
  const { requestId, expectedUpdatedAt } = p.data;
  const ends = p.data.scope === "future" && series.kind === "weekly";

  // A retried "future" cancel finds its first result in the write context: the series already ends the day before.
  const written = await bookUnderStamps(deps, { requestId, keys: keysOf(series), ops: [ends ? "end_series" : "cancel"], target: seriesId }, async (stamps) => {
    const closed = checkOccurrence(deps, series, date);
    if (closed) return closed;
    let now;
    try {
      now = await currentPosition(deps, series, date);
    } catch {
      return unavailable();
    }
    if (stalePosition(p.data, now)) return send(409, { error: "stale" });
    if (series.updatedAt !== expectedUpdatedAt) return send(409, { error: "stale" });
    if (ends) return deps.store.lockedWrite({ op: "end_series", requestId, stamps, seriesId, expectedUpdatedAt, lastDate: addDays(date, -1) });
    return deps.store.lockedWrite({ op: "cancel", requestId, stamps, seriesId, expectedUpdatedAt, originalDate: date, expectedPosition: now });
  });
  if (isRes(written)) return written;
  if (!ends) return send(200, SeriesResponse.parse(seriesBody(written.series, undefined, await refreshToday(deps))));
  if (written.replayed) return send(200, SeriesResponse.parse(seriesBody(written.series)));
  const summarySync = await syncStudents(deps, [series.studentId]);
  return send(200, SeriesResponse.parse(seriesBody(written.series, summarySync, await refreshToday(deps))));
}
