import { computeAvailability, type AvailabilityException, type AvailabilityWindow } from "../domain/schedule/availability";
import { checkBooking } from "../domain/schedule/booking";
import { expandOccurrences, type ClassException, type ClassSeries, type Occurrence } from "../domain/schedule/recurrence";
import { addDays, minutesOf, timeOf } from "../domain/schedule/wallclock";
import { localDateOf } from "../time";
import type { StudentSchedule } from "./notice";
import { MAKEUP_LEAD_HOURS, MAKEUP_MAX_SLOTS, OPTIONS_TOKEN } from "./policy";

/**
 * Rung 5 (REQ-47, tracker ADR 0075): make-up times for a reschedule request,
 * from the teacher's declared availability and the scheduler's own collision
 * check. Pure. The target is the next class to start after the message; slots
 * sit between its end and the next class's start, on a 30-minute grid, at
 * most one per date. Iris never books any of them.
 */
export type TeacherCalendar = { series: ClassSeries[]; exceptions: ClassException[]; windows: AvailabilityWindow[]; availabilityExceptions: AvailabilityException[] };
export type Slot = { date: string; startTime: string; endTime: string; startsAt: string; endsAt: string };
export type MakeupResult = { kind: "slots"; slots: Slot[] } | { kind: "not_entered" } | { kind: "none_free" };

const HORIZON_DAYS = 42;
const GRID_MINUTES = 30;
const NO_NEXT_DAYS = 7;

export function resolveRescheduleTarget(i: { receivedAt: string } & StudentSchedule): { target: Occurrence; next: Occurrence | null } | null {
  const day = localDateOf(i.receivedAt);
  if (!day) return null;
  const received = Date.parse(i.receivedAt);
  const kept = expandOccurrences(i.series, i.exceptions, { from: day, to: addDays(day, HORIZON_DAYS) }).filter((o) => o.status !== "cancelled");
  const at = kept.findIndex((o) => Date.parse(o.startsAt) > received);
  if (at < 0) return null;
  return { target: kept[at], next: kept[at + 1] ?? null };
}

export function makeupRange(target: Occurrence, next: Occurrence | null): { from: string; to: string } {
  return { from: target.date, to: next ? next.date : addDays(target.date, NO_NEXT_DAYS) };
}

export function findMakeupSlots(i: { target: Occurrence; next: Occurrence | null; student: StudentSchedule; teacher: TeacherCalendar; now: Date }): MakeupResult {
  const { target, next, teacher } = i;
  if (teacher.windows.length === 0 && teacher.availabilityExceptions.length === 0) return { kind: "not_entered" };
  const range = makeupRange(target, next);
  const days = computeAvailability(teacher.windows, teacher.availabilityExceptions, range);
  const earliest = Math.max(Date.parse(target.endsAt), i.now.getTime() + MAKEUP_LEAD_HOURS * 3_600_000);
  const latest = next ? Date.parse(next.startsAt) : Infinity;

  const candidates: Occurrence[] = [];
  for (const d of days) {
    if (d.state !== "available") continue;
    for (const iv of d.intervals) {
      const end = minutesOf(iv.end);
      for (let s = Math.ceil(minutesOf(iv.start) / GRID_MINUTES) * GRID_MINUTES; s + target.durationMinutes <= end; s += GRID_MINUTES) {
        const offer: ClassSeries = {
          id: "offer", staffId: target.staffId, studentId: target.studentId, subject: target.subject,
          kind: "one_off", startDate: d.date, startTime: timeOf(s), durationMinutes: target.durationMinutes, effectiveUntil: null,
        };
        const [c] = expandOccurrences([offer], [], { from: d.date, to: d.date });
        if (Date.parse(c.startsAt) >= earliest && Date.parse(c.endsAt) <= latest) candidates.push(c);
      }
    }
  }

  const byKey = new Map<string, Occurrence>();
  for (const o of expandOccurrences([...teacher.series, ...i.student.series], [...teacher.exceptions, ...i.student.exceptions], range)) byKey.set(o.occurrenceKey, o);
  const problems = checkBooking({
    candidates,
    others: [...byKey.values()],
    availability: new Map([[target.staffId, { days, exceptions: teacher.availabilityExceptions }]]),
    checkAvailability: true,
    today: localDateOf(i.now.toISOString()) ?? range.from,
  });
  const bad = new Set(problems.map((p) => `${p.date} ${p.startTime}`));

  const slots: Slot[] = [];
  for (const c of candidates.sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    if (bad.has(`${c.date} ${c.startTime}`) || slots.some((s) => s.date === c.date)) continue;
    slots.push({ date: c.date, startTime: c.startTime, endTime: c.endTime, startsAt: c.startsAt, endsAt: c.endsAt });
    if (slots.length === MAKEUP_MAX_SLOTS) break;
  }
  return slots.length > 0 ? { kind: "slots", slots } : { kind: "none_free" };
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const clock = (time: string) => {
  const m = minutesOf(time);
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

/** "Thursday 29 October, 4:00 pm to 5:00 pm". */
export function formatSlot(s: Slot): string {
  const [y, mo, d] = s.date.split("-").map(Number);
  const parts = dayFormat.formatToParts(new Date(Date.UTC(y, mo - 1, d)));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${clock(s.startTime)} to ${clock(s.endTime)}`;
}

/** The body with its one [OPTIONS] line replaced by one line per slot; null unless the token appears exactly once, on its own line. */
export function fillOptions(body: string, slots: Slot[]): string | null {
  if (body.split(OPTIONS_TOKEN).length !== 2) return null;
  const lines = body.split("\n");
  const at = lines.findIndex((l) => l.trim() === OPTIONS_TOKEN);
  if (at < 0) return null;
  return [...lines.slice(0, at), ...slots.map((s) => `- ${formatSlot(s)}`), ...lines.slice(at + 1)].join("\n");
}
