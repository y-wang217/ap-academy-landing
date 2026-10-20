import { z } from "zod";
import {
  isLinkable, LessonLinkError, occurrenceRef, planLog, reconcile, type LessonLinkPort, type LessonRow,
} from "../domain/schedule/lesson-link";
import { normalId } from "../domain/billing";
import { expandOccurrences, isPatternDate, type Occurrence } from "../domain/schedule/recurrence";
import { addDays, daysBetween } from "../domain/schedule/wallclock";
import { assertStaffAccess, requireScheduler, type Allowed, type Denial } from "./guard";
import type { OutcomeRecord, OutcomeStore } from "./outcome-store";
import type { ScheduleDeps } from "./schedule-handlers";
import { LessonOutcomeResponse, UnlinkedResponse } from "./schemas";

/**
 * Log this class, Mark no-show, the owner's corrections and the Unlinked
 * lessons list (REQ-39, tracker ADR 0056). The guard runs first, and the
 * teacher's access is checked on the series before any outcome or Notion
 * call. Every Notion write goes through the lessons port, which finds first.
 */
const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial | { ok: false; status: 403; body: { error: "forbidden" } }) => send(d.status, d.body);
const err = (status: number, error: string) => send(status, { error });
const unavailable = () => err(503, "scheduler_unavailable");
const notReady = () => err(503, "lessons_not_ready");

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const Target = { seriesId: z.guid(), originalDate: IsoDate };
const LogBody = z.strictObject(Target);
const NoShowBody = z.strictObject({ ...Target, outcome: z.literal("no_show") });
const ClearBody = z.strictObject(Target);
const LinkBody = z.strictObject({ ...Target, lessonId: z.guid() });

const DEFAULT_DAYS = 14;
const MAX_DAYS = 31;

export const lessonUrl = (id: string) => `https://www.notion.so/${normalId(id)}`;
const delivered = (r: OutcomeRecord) =>
  LessonOutcomeResponse.shape.outcome.parse({ state: "delivered", lessonId: r.notionLessonId, lessonDate: r.lessonDate, lessonUrl: lessonUrl(r.notionLessonId!) });

/** A Notion failure as the response the UI explains. */
function fromNotion(e: unknown): Response {
  if (e instanceof LessonLinkError) return e.code === "lessons_not_ready" ? notReady() : err(409, "duplicate_link");
  return err(502, "notion_failed");
}

type Wired = { lessons: LessonLinkPort; outcomes: OutcomeStore };
type Loaded = { gate: Allowed; wired: Wired; occurrence: Occurrence };

/**
 * The shared front of every write: guard, wiring, body, series, access, and
 * the one occurrence, which must be linkable today. Returns the response to
 * send instead when any of those fails.
 */
async function loadTarget(
  deps: ScheduleDeps, scopes: ("admin" | "teacher")[], body: { seriesId: string; originalDate: string },
): Promise<Loaded | Response> {
  const g = requireScheduler(await deps.identity(), scopes);
  if (!g.ok) return deny(g);
  if (!deps.lessons || !deps.outcomes) return notReady();
  let series;
  try {
    series = await deps.store.getSeries(body.seriesId);
  } catch {
    return unavailable();
  }
  if (!series) return err(404, "not_found");
  const access = assertStaffAccess(g.identity, series.staffId);
  if (!access.ok) return deny(access);
  if (!isPatternDate(series, body.originalDate)) return err(422, "not_linkable");
  let exceptions;
  try {
    ({ exceptions } = await deps.store.listSeries({ from: body.originalDate, to: body.originalDate }, series.staffId));
  } catch {
    return unavailable();
  }
  const own = exceptions.filter((e) => e.seriesId === series.id && e.originalDate === body.originalDate);
  const moved = own.find((e) => e.kind === "moved" && e.newDate);
  const to = moved?.newDate && moved.newDate > body.originalDate ? moved.newDate : body.originalDate;
  const from = moved?.newDate && moved.newDate < body.originalDate ? moved.newDate : body.originalDate;
  const occurrence = expandOccurrences([series], own, { from, to }).find((o) => o.originalDate === body.originalDate);
  const today = deps.today();
  if (occurrence) {
    if (!isLinkable(occurrence, today)) return err(422, "not_linkable");
    return { gate: g, wired: { lessons: deps.lessons, outcomes: deps.outcomes }, occurrence };
  }
  // A cancelled occurrence is still expanded; anything else missing is not a class.
  return err(422, "not_linkable");
}
const isRes = (x: unknown): x is Response => x instanceof Response;
const nowOf = (deps: ScheduleDeps) => (deps.now ?? Date.now)();

/** Claim the occurrence, or take over a stale claim. Returns the claimed row, or the response to send. */
async function claimFor(
  deps: ScheduleDeps, outcomes: OutcomeStore, key: { seriesId: string; originalDate: string }, linkSource: "logged" | "reconciled",
): Promise<OutcomeRecord | Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const local = await outcomes.get(key.seriesId, key.originalDate);
    const step = planLog(local, nowOf(deps));
    if (step === "conflict") return err(409, "already_recorded");
    if (step === "replay") return send(200, { created: false, outcome: delivered(local!) });
    if (step === "busy") return err(409, "log_in_progress");
    if (step === "resume") {
      const taken = await outcomes.takeOver(local!.id, local!.claimedAt);
      return taken ?? err(409, "log_in_progress");
    }
    const claimed = await outcomes.claim({ ...key, linkSource });
    if (claimed.ok) return claimed.row;
    // Lost the insert race: read again and answer from the winner's row.
  }
  return err(409, "log_in_progress");
}

/** POST /api/scheduler/lessons: Log this class. Find first, create only on none. */
export async function handleLogClass(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = requireScheduler(await deps.identity(), ["admin", "teacher"]);
  if (!g.ok) return deny(g);
  const parsed = LogBody.safeParse(body);
  if (!parsed.success) return err(400, "invalid_request");
  const t = await loadTarget(deps, ["admin", "teacher"], parsed.data);
  if (isRes(t)) return t;
  const { lessons, outcomes } = t.wired;
  const o = t.occurrence;

  let row: OutcomeRecord | Response;
  try {
    row = await claimFor(deps, outcomes, parsed.data, "logged");
  } catch {
    return unavailable();
  }
  if (isRes(row)) return row;

  const ref = occurrenceRef(o);
  let lessonId: string;
  let created = false;
  try {
    const found = await lessons.findLessonFor(ref);
    if (found) lessonId = found.lessonId;
    else {
      lessonId = (await lessons.createLesson({ ref, date: o.date, staffId: o.staffId, studentId: o.studentId, durationMinutes: o.durationMinutes })).lessonId;
      created = true;
    }
  } catch (e) {
    // The claim stays pending: the next request after it lapses finds a committed create.
    return fromNotion(e);
  }
  try {
    const done = await outcomes.complete(row.id, lessonId, o.date);
    return send(created ? 201 : 200, LessonOutcomeResponse.parse({ created, outcome: delivered(done) }));
  } catch {
    return unavailable();
  }
}

/** POST /api/scheduler/outcomes: Mark no-show. Local only, never Notion. */
export async function handleNoShow(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = requireScheduler(await deps.identity(), ["admin", "teacher"]);
  if (!g.ok) return deny(g);
  const parsed = NoShowBody.safeParse(body);
  if (!parsed.success) return err(400, "invalid_request");
  const t = await loadTarget(deps, ["admin", "teacher"], parsed.data);
  if (isRes(t)) return t;
  try {
    if (await t.wired.outcomes.get(parsed.data.seriesId, parsed.data.originalDate)) return err(409, "already_recorded");
    const r = await t.wired.outcomes.insertNoShow({ seriesId: parsed.data.seriesId, originalDate: parsed.data.originalDate });
    return r.ok ? send(201, { outcome: { state: "no_show" } }) : err(409, "already_recorded");
  } catch {
    return unavailable();
  }
}

/**
 * DELETE /api/scheduler/outcomes: the owner's Clear. A delivered row's lesson
 * loses its ref first, but only when it still holds this ref; then the row is
 * deleted and the audit trigger keeps it.
 */
export async function handleClearOutcome(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = requireScheduler(await deps.identity(), ["admin"]);
  if (!g.ok) return deny(g);
  const parsed = ClearBody.safeParse(body);
  if (!parsed.success) return err(400, "invalid_request");
  if (!deps.lessons || !deps.outcomes) return notReady();
  let row: OutcomeRecord | null;
  try {
    row = await deps.outcomes.get(parsed.data.seriesId, parsed.data.originalDate);
  } catch {
    return unavailable();
  }
  if (!row) return err(404, "not_found");
  let lesson: "cleared" | "kept" | "gone" | null = null;
  if (row.notionLessonId) {
    try {
      lesson = await deps.lessons.unlinkLesson(row.notionLessonId, occurrenceRef(parsed.data));
    } catch (e) {
      return fromNotion(e);
    }
  }
  try {
    if (!(await deps.outcomes.remove(row.id))) return err(404, "not_found");
  } catch {
    return unavailable();
  }
  return send(200, { cleared: true, lesson });
}

export type UnlinkedResult = { ok: true; body: z.infer<typeof UnlinkedResponse> } | { ok: false; status: number; error: string };

/**
 * The owner's Unlinked lessons list for a date range (default the 14 days
 * ending today, at most 31). Reads only: series, outcomes, and Lessons rows
 * with an empty ref. The page and the route both call this.
 */
export async function loadUnlinked(deps: ScheduleDeps, q: { from?: string | null; to?: string | null }): Promise<UnlinkedResult> {
  const fail = (status: number, error: string): UnlinkedResult => ({ ok: false, status, error });
  const g = requireScheduler(await deps.identity(), ["admin"]);
  if (!g.ok) return fail(g.status, g.body.error);
  const today = deps.today();
  const to = q.to ?? today;
  const from = q.from ?? addDays(to, -(DEFAULT_DAYS - 1));
  if (!IsoDate.safeParse(from).success || !IsoDate.safeParse(to).success || from > to || daysBetween(from, to) + 1 > MAX_DAYS) return fail(400, "invalid_request");
  if (!deps.lessons || !deps.outcomes) return fail(503, "lessons_not_ready");
  const range = { from, to };

  let occurrences: Occurrence[];
  let outcomes: OutcomeRecord[];
  let rows: LessonRow[];
  try {
    const { series, exceptions } = await deps.store.listSeries(range);
    occurrences = expandOccurrences(series, exceptions, range).filter((o) => isLinkable(o, today));
    outcomes = await deps.outcomes.listForOccurrences(occurrences.map((o) => ({ seriesId: o.seriesId, originalDate: o.originalDate })));
  } catch {
    return fail(503, "scheduler_unavailable");
  }
  try {
    rows = await deps.lessons.listUnlinkedLessons(range);
  } catch (e) {
    return e instanceof LessonLinkError && e.code === "lessons_not_ready" ? fail(503, "lessons_not_ready") : fail(502, "notion_failed");
  }
  const staffNames = new Map<string, string>();
  try {
    for (const s of await deps.fetchStaff()) staffNames.set(s.id, s.name);
  } catch {
    // Names are a convenience; the list still works without them.
  }
  let studentNames = new Map<string, string>();
  try {
    if (deps.studentNames) studentNames = await deps.studentNames();
  } catch {
    // As above.
  }
  const r = reconcile(occurrences, outcomes.map((x) => ({ seriesId: x.seriesId, originalDate: x.originalDate, outcome: x.outcome })), rows);
  const describe = (o: Occurrence) => ({
    seriesId: o.seriesId, originalDate: o.originalDate, date: o.date, startTime: o.startTime, endTime: o.endTime, subject: o.subject,
    staffId: o.staffId, staffName: staffNames.get(o.staffId) ?? null, studentId: o.studentId, studentName: studentNames.get(o.studentId) ?? null,
  });
  return {
    ok: true,
    body: UnlinkedResponse.parse({
      from, to,
      unlinked: r.unlinked.map((u) => ({ ...describe(u.occurrence), candidates: u.candidates.map((c) => ({ lessonId: c.id, date: c.date, lessonUrl: lessonUrl(c.id) })) })),
      doubles: r.doubles.map((d) => ({ ...describe(d.occurrence), lessonId: d.lesson.id, lessonUrl: lessonUrl(d.lesson.id) })),
    }),
  };
}

/** GET /api/scheduler/lessons/unlinked?from&to. Admin only. */
export async function handleUnlinked(deps: ScheduleDeps, q: URLSearchParams): Promise<Response> {
  const r = await loadUnlinked(deps, { from: q.get("from"), to: q.get("to") });
  return r.ok ? send(200, r.body) : err(r.status, r.error);
}

/**
 * POST /api/scheduler/lessons/link: the owner links one form-logged row to one
 * class. Checks, in order: no other row holds the ref, the row holds no other
 * ref, and its teacher, student and date are the class's. Then claim, patch
 * the ref alone, and complete. Nothing is linked without this click.
 */
export async function handleLinkLesson(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = requireScheduler(await deps.identity(), ["admin"]);
  if (!g.ok) return deny(g);
  const parsed = LinkBody.safeParse(body);
  if (!parsed.success) return err(400, "invalid_request");
  const t = await loadTarget(deps, ["admin"], parsed.data);
  if (isRes(t)) return t;
  const { lessons, outcomes } = t.wired;
  const o = t.occurrence;
  const ref = occurrenceRef(o);
  const lessonId = parsed.data.lessonId;

  try {
    const local = await outcomes.get(o.seriesId, o.originalDate);
    if (local && (local.outcome === "no_show" || local.notionLessonId)) return err(409, "already_recorded");
  } catch {
    return unavailable();
  }
  let lesson: LessonRow | null;
  try {
    const found = await lessons.findLessonFor(ref);
    if (found && normalId(found.lessonId) !== normalId(lessonId)) return err(409, "ref_in_use");
    lesson = await lessons.getLesson(lessonId);
  } catch (e) {
    return fromNotion(e);
  }
  if (!lesson) return err(404, "not_found");
  if (lesson.ref !== "" && lesson.ref !== ref) return err(409, "lesson_linked_elsewhere");
  const same = (ids: string[], id: string) => ids.some((x) => normalId(x) === normalId(id));
  if (lesson.date !== o.date || !same(lesson.staffIds, o.staffId) || !same(lesson.studentIds, o.studentId)) return err(422, "lesson_mismatch");

  let row: OutcomeRecord | Response;
  try {
    row = await claimFor(deps, outcomes, { seriesId: o.seriesId, originalDate: o.originalDate }, "reconciled");
  } catch {
    return unavailable();
  }
  if (isRes(row)) return row.status === 200 ? err(409, "already_recorded") : row;
  try {
    if (lesson.ref !== ref) await lessons.linkLesson(lessonId, ref);
  } catch (e) {
    return fromNotion(e);
  }
  try {
    const done = await outcomes.complete(row.id, lessonId, o.date);
    return send(200, LessonOutcomeResponse.parse({ created: false, outcome: delivered(done) }));
  } catch {
    return unavailable();
  }
}
