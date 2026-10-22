import { expandOccurrences, type ClassException, type ClassSeries } from "../domain/schedule/recurrence";
import { addDays } from "../domain/schedule/wallclock";
import { localDateOf } from "../time";
import { NOTICE_HOURS } from "./policy";

/**
 * Rung 4 (REQ-46, tracker ADR 0072): which class a cancellation is about and
 * how much notice it gave, from the family's own schedule. Pure. The target
 * is the latest class that started on the message's local day, else the next
 * class to start. Notice is real elapsed time from the earliest inbound
 * message of the thread in the 7 days before that class, so DST is handled
 * once, in wallclock.ts.
 */
export type NoticeResult =
  | { kind: "cancel_with_notice" | "late_cancel"; missedDate: string; missedStartsAt: string; nextDate: string | null; noticeMinutes: number }
  | { kind: "no_show"; missedDate: string; missedStartsAt: string }
  | { kind: "schedule_unknown" };

export type StudentSchedule = { series: ClassSeries[]; exceptions: ClassException[] };

const HORIZON_DAYS = 42;
const WINDOW_MS = 7 * 86_400_000;

export function resolveCancellation(input: {
  /** ISO instant of this message. */
  receivedAt: string;
  /** received_at of earlier inbound messages in the thread. */
  earlierInbound: string[];
  series: ClassSeries[];
  exceptions: ClassException[];
}): NoticeResult {
  const day = localDateOf(input.receivedAt);
  if (!day) return { kind: "schedule_unknown" };
  const received = Date.parse(input.receivedAt);
  const kept = expandOccurrences(input.series, input.exceptions, { from: addDays(day, -1), to: addDays(day, HORIZON_DAYS) })
    .filter((o) => o.status !== "cancelled");

  const startedToday = kept.filter((o) => o.date === day && Date.parse(o.startsAt) <= received);
  const target = startedToday.length > 0 ? startedToday[startedToday.length - 1] : kept.find((o) => Date.parse(o.startsAt) > received);
  if (!target) return { kind: "schedule_unknown" };

  const start = Date.parse(target.startsAt);
  // Earlier messages count inside the window; this one counts whenever it is before the start.
  const notices = input.earlierInbound.map(Date.parse).filter((t) => t >= start - WINDOW_MS && t < start);
  if (received < start) notices.push(received);
  if (notices.length === 0) return { kind: "no_show", missedDate: target.date, missedStartsAt: target.startsAt };

  const noticeMinutes = Math.floor((start - Math.min(...notices)) / 60_000);
  const after = kept.slice(kept.indexOf(target) + 1)[0];
  return {
    kind: noticeMinutes >= NOTICE_HOURS * 60 ? "cancel_with_notice" : "late_cancel",
    missedDate: target.date,
    missedStartsAt: target.startsAt,
    nextDate: after?.date ?? null,
    noticeMinutes,
  };
}
