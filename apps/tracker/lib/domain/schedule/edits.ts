import { minutesOf } from "./wallclock";

export type EditRejection = { ok: false; status: 400 | 422; error: "past_occurrence" | "invalid_duration" | "crosses_midnight" };
export type EditCheck = { ok: true } | EditRejection;

/** Past occurrences (original date before today in the schedule zone) are never edited. */
export function checkOccurrenceEditable(originalDate: string, today: string): EditCheck {
  return originalDate < today ? { ok: false, status: 422, error: "past_occurrence" } : { ok: true };
}

/** Duration 15..480 in steps of 5, and the class must end by 24:00 local. */
export function checkClassShape(startTime: string, durationMinutes: number): EditCheck {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || durationMinutes % 5 !== 0) {
    return { ok: false, status: 400, error: "invalid_duration" };
  }
  return minutesOf(startTime) + durationMinutes > 1440 ? { ok: false, status: 400, error: "crosses_midnight" } : { ok: true };
}
