import type { Occurrence } from "./recurrence";

/**
 * Extension point for linking a delivered lesson to the class occurrence it
 * came from (REQ-9, ADR 0040). Nothing uses this yet: the tracker has no
 * lesson-logging flow and the Lessons data source has no field to hold the
 * reference. Pure on purpose, so a later card can wire it without moving it.
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
 * and dated today or earlier (`today` is the local date). Past occurrences
 * cannot be edited or split, so a ref made under this rule never goes stale.
 */
export function isLinkable(o: Pick<Occurrence, "status" | "date">, today: string): boolean {
  return o.status !== "cancelled" && o.date <= today;
}

/**
 * The contract for the future wiring. An implementation must: find first, so
 * a retry is a no-op; write only the one link property; never touch Paid to
 * Teacher, Pay Period, Duration or Teacher; and act only on `isLinkable`
 * occurrences.
 */
export type LessonLinkPort = {
  findLessonFor(ref: string): Promise<{ lessonId: string } | null>;
  linkLesson(lessonId: string, ref: string): Promise<void>;
};
