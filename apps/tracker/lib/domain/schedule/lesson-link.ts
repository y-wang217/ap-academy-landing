import { normalId } from "../billing";
import type { Occurrence } from "./recurrence";

/**
 * Linking a delivered lesson to the class occurrence it came from (REQ-39,
 * tracker ADR 0056, which supersedes ADR 0040). The Notion Lessons row carries
 * the ref in its `Class occurrence` property; the tracker keeps a local
 * outcome row as the claim and the week view's cache. Pure on purpose: the
 * handlers and the Notion adapter do the I/O.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `sched:<seriesId>:<originalDate>`, the existing occurrence key with a self-describing prefix. */
export function occurrenceRef(o: Pick<Occurrence, "seriesId" | "originalDate">): string {
  return `sched:${o.seriesId}:${o.originalDate}`;
}

export function parseOccurrenceRef(ref: string): { seriesId: string; originalDate: string } | null {
  const parts = ref.split(":");
  if (parts.length !== 3 || parts[0] !== "sched") return null;
  const [, seriesId, originalDate] = parts;
  if (!UUID.test(seriesId) || !ISO_DATE.test(originalDate)) return null;
  if (Number.isNaN(Date.parse(`${originalDate}T00:00:00Z`)) || new Date(`${originalDate}T00:00:00Z`).toISOString().slice(0, 10) !== originalDate) return null;
  return { seriesId, originalDate };
}

/**
 * A class can be linked to a lesson only once it has happened: not cancelled
 * and dated today or earlier (`today` is the local date). The database freezes
 * an occurrence once it has an outcome, so a ref made under this rule never
 * goes stale (migration 0023).
 */
export function isLinkable(o: Pick<Occurrence, "status" | "date">, today: string): boolean {
  return o.status !== "cancelled" && o.date <= today;
}

/** Duration (hrs) on a created Lessons row: minutes / 60, to 2 decimals. */
export function lessonHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** A Lessons row as the tracker sees it: the four properties it reads, nothing else. */
export type LessonRow = { id: string; date: string | null; staffIds: string[]; studentIds: string[]; ref: string };
export type NewLesson = { ref: string; date: string; staffId: string; studentId: string; durationMinutes: number };

/** The errors the lesson flow answers by name. Anything else from the port is a Notion failure. */
export class LessonLinkError extends Error {
  constructor(readonly code: "duplicate_link" | "lessons_not_ready") {
    super(code);
    this.name = "LessonLinkError";
  }
}

/**
 * The contract. An implementation must: find first, so a retry is a no-op;
 * write only the `Class occurrence` property on an existing row; never touch
 * Paid to Teacher, Pay Period, Type, Duration or Teacher on an existing row;
 * and be called only for `isLinkable` occurrences.
 */
export type LessonLinkPort = {
  /** Throws `duplicate_link` when two or more rows carry the ref. */
  findLessonFor(ref: string): Promise<{ lessonId: string } | null>;
  linkLesson(lessonId: string, ref: string): Promise<void>;
  /** Clears the property only when it still equals `ref`. */
  unlinkLesson(lessonId: string, ref: string): Promise<"cleared" | "kept" | "gone">;
  getLesson(lessonId: string): Promise<LessonRow | null>;
  createLesson(input: NewLesson): Promise<{ lessonId: string }>;
  /** Rows dated in the range whose `Class occurrence` is empty. */
  listUnlinkedLessons(range: { from: string; to: string }): Promise<LessonRow[]>;
};

/** A claim older than this is taken over by the next request. */
export const CLAIM_MS = 60_000;

export type LocalOutcome = { outcome: "delivered" | "no_show"; notionLessonId: string | null; claimedAt: string | null };
export type LogStep = "claim" | "resume" | "replay" | "busy" | "conflict";

/** What a Log this class request does, given the stored outcome row (if any). */
export function planLog(local: LocalOutcome | null, now: number): LogStep {
  if (!local) return "claim";
  if (local.outcome === "no_show") return "conflict";
  if (local.notionLessonId) return "replay";
  if (local.claimedAt && now - Date.parse(local.claimedAt) < CLAIM_MS) return "busy";
  return "resume";
}

export type OutcomeKey = { seriesId: string; originalDate: string; outcome: "delivered" | "no_show" };
export type Reconciliation = {
  unlinked: { occurrence: Occurrence; candidates: LessonRow[] }[];
  doubles: { occurrence: Occurrence; lesson: LessonRow }[];
};

const matches = (o: Occurrence, l: LessonRow) =>
  l.date === o.date
  && l.staffIds.some((id) => normalId(id) === normalId(o.staffId))
  && l.studentIds.some((id) => normalId(id) === normalId(o.studentId));

/**
 * The owner's Unlinked lessons list. `occurrences` are the linkable ones;
 * `lessons` are rows with an empty ref. Matching is exact on teacher, student
 * and actual date. It lists candidates and never picks one.
 */
export function reconcile(occurrences: Occurrence[], outcomes: OutcomeKey[], lessons: LessonRow[]): Reconciliation {
  const outcomeOf = new Map(outcomes.map((x) => [`${x.seriesId}:${x.originalDate}`, x.outcome]));
  const out: Reconciliation = { unlinked: [], doubles: [] };
  for (const o of occurrences) {
    const state = outcomeOf.get(`${o.seriesId}:${o.originalDate}`);
    const same = lessons.filter((l) => matches(o, l));
    if (!state) out.unlinked.push({ occurrence: o, candidates: same });
    else if (state === "delivered") for (const l of same) out.doubles.push({ occurrence: o, lesson: l });
  }
  return out;
}
