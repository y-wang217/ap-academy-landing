import type { ApiFailure } from "../scheduler/api-client";
import { minutesOf, timeOf } from "../domain/schedule/wallclock";
import { formatDayHeading } from "./availability-text";

type Problem = { date: string; startTime: string; endTime: string; reason: string };

export const dropLabel = (date: string, startTime: string, durationMinutes: number) =>
  `${formatDayHeading(date)} ${startTime}-${timeOf(minutesOf(startTime) + durationMinutes)}`;

/** A concise, plain sentence for a rejected booking: the first problem, plus a count of the rest. */
export function bookingMessage(problems: Problem[], more: number, teacherName: string): string {
  const first = problems[0];
  if (!first) return "Not saved. Please try again.";
  const slot = `${formatDayHeading(first.date)} ${first.startTime}-${first.endTime}`;
  const text =
    first.reason === "teacher_busy" ? `${teacherName} already has a class ${slot}.`
    : first.reason === "student_busy" ? `the student already has a class ${slot}.`
    : first.reason === "time_off" ? `${teacherName} has time off then.`
    : first.reason === "availability_not_entered" ? `${teacherName} has no availability entered.`
    : `${teacherName} is not available then.`;
  const rest = problems.length - 1 + more;
  const tail = rest > 0 ? ` ${rest} more ${rest === 1 ? "date has a problem" : "dates have problems"}.` : "";
  return `Not saved: ${text}${tail}`;
}

/** One sentence for any failed booking save, whatever the status. */
export function saveErrorMessage(f: ApiFailure, teacherName: string): string {
  if (f.stale) return f.message;
  if (f.error === "booking_conflict") return bookingMessage(f.problems ?? [], f.more ?? 0, teacherName);
  if (f.error === "past_occurrence") return "Not saved: that class has already started or passed.";
  if (f.error === "moved_occurrence") return "Not saved: this class was already moved, so change only this class.";
  return `Not saved. ${f.message}`;
}
