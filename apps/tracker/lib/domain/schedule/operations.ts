import { normalId } from "../billing";
import { isActiveTeachingStaff } from "../staff";
import { computeAvailability, type AvailabilityException, type AvailabilityWindow } from "./availability";
import { isLinkable, occurrenceRef, reconcile, type LessonRow } from "./lesson-link";
import type { Occurrence } from "./recurrence";
import { addDays } from "./wallclock";
import { weekTotals } from "./week";

/**
 * Operations mode, scheduler half (REQ-58): teacher load, lesson-log gaps,
 * upcoming classes and the roster, from expanded occurrences. Pure: the
 * console reader does the I/O and the panel builder the statuses. Unknown is
 * always null, never 0.
 */
export type OutcomeFact = { seriesId: string; originalDate: string; outcome: "delivered" | "no_show"; notionLessonId: string | null };
export type StaffAvailability = { staffId: string; windows: AvailabilityWindow[]; exceptions: AvailabilityException[] };
export type DateRange = { from: string; to: string };

export type WeekLoad = {
  from: string;
  to: string;
  scheduledMinutes: number;
  /** Current week only; null when outcomes are unknown or the week is not the current one. */
  deliveredMinutes: number | null;
  availability: "entered" | "not_entered" | "unknown";
  availableMinutes: number | null;
  insideMinutes: number | null;
  outsideMinutes: number | null;
  /** insideMinutes / availableMinutes, only when availableMinutes > 0. */
  utilisation: number | null;
};
export type TeacherLoadRow = { staffId: string; weeks: [WeekLoad, WeekLoad] };

const same = (a: string, b: string) => normalId(a) === normalId(b);
const inRange = (date: string, r: DateRange) => date >= r.from && date <= r.to;
const outcomeKey = (seriesId: string, originalDate: string) => `${seriesId}:${originalDate}`;

function weekLoad(
  occurrences: Occurrence[], week: DateRange, availability: StaffAvailability | null | undefined, known: boolean,
  delivered: number | null,
): WeekLoad {
  const mine = occurrences.filter((o) => inRange(o.date, week));
  if (!known) {
    const { scheduledMinutes } = weekTotals(mine, []);
    return { ...week, scheduledMinutes, deliveredMinutes: delivered, availability: "unknown", availableMinutes: null, insideMinutes: null, outsideMinutes: null, utilisation: null };
  }
  const days = computeAvailability(availability?.windows ?? [], availability?.exceptions ?? [], week);
  const totals = weekTotals(mine, days);
  if (totals.availableMinutes === null || totals.remainingMinutes === null) {
    return { ...week, scheduledMinutes: totals.scheduledMinutes, deliveredMinutes: delivered, availability: "not_entered", availableMinutes: null, insideMinutes: null, outsideMinutes: null, utilisation: null };
  }
  const inside = totals.availableMinutes - totals.remainingMinutes;
  return {
    ...week,
    scheduledMinutes: totals.scheduledMinutes,
    deliveredMinutes: delivered,
    availability: "entered",
    availableMinutes: totals.availableMinutes,
    insideMinutes: inside,
    outsideMinutes: Math.max(0, totals.scheduledMinutes - inside),
    utilisation: totals.availableMinutes > 0 ? inside / totals.availableMinutes : null,
  };
}

/**
 * Scheduled minutes exclude cancelled classes and count a move on its new date (weekTotals).
 * Delivered counts only ended, non-cancelled classes whose outcome is delivered with a lesson id.
 */
export function teacherLoad(input: {
  staffIds: string[]; occurrences: Occurrence[]; current: DateRange; next: DateRange;
  availability: StaffAvailability[] | null; outcomes: OutcomeFact[] | null; now: Date;
}): TeacherLoadRow[] {
  const delivered = new Set((input.outcomes ?? []).filter((x) => x.outcome === "delivered" && x.notionLessonId).map((x) => outcomeKey(x.seriesId, x.originalDate)));
  return [...input.staffIds].sort().map((staffId): TeacherLoadRow => {
    const mine = input.occurrences.filter((o) => same(o.staffId, staffId));
    const avail = input.availability?.find((a) => same(a.staffId, staffId));
    const deliveredMinutes = input.outcomes === null
      ? null
      : mine
          .filter((o) => inRange(o.date, input.current) && o.status !== "cancelled" && Date.parse(o.endsAt) <= input.now.getTime() && delivered.has(outcomeKey(o.seriesId, o.originalDate)))
          .reduce((n, o) => n + o.durationMinutes, 0);
    const known = input.availability !== null;
    return { staffId, weeks: [weekLoad(mine, input.current, avail, known, deliveredMinutes), weekLoad(mine, input.next, avail, known, null)] };
  });
}

export type GapRow = { key: string; occurrence: Occurrence; nextAction: "log" | "link" | "review"; candidates: number | null };

/**
 * Ended, not cancelled classes in the window with no outcome row (reconcile). A no-show is never a
 * gap; a delivered row with no lesson id is a log in progress, neither a gap nor delivered.
 */
export function lessonGaps(input: {
  occurrences: Occurrence[]; window: DateRange; today: string; now: Date; outcomes: OutcomeFact[]; lessons: LessonRow[] | null;
}): { gaps: GapRow[]; noShows: Occurrence[]; pendingLogs: number } {
  const linkable = input.occurrences.filter((o) => isLinkable(o, input.today) && Date.parse(o.endsAt) <= input.now.getTime() && inRange(o.date, input.window));
  const byKey = new Map(input.outcomes.map((x) => [outcomeKey(x.seriesId, x.originalDate), x]));
  const { unlinked } = reconcile(linkable, input.outcomes.map(({ seriesId, originalDate, outcome }) => ({ seriesId, originalDate, outcome })), input.lessons ?? []);
  const gaps = unlinked
    .map(({ occurrence, candidates }): GapRow => ({
      key: occurrenceRef(occurrence),
      occurrence,
      nextAction: input.lessons === null ? "review" : candidates.length > 0 ? "link" : "log",
      candidates: input.lessons === null ? null : candidates.length,
    }))
    .sort((a, b) => a.occurrence.endsAt.localeCompare(b.occurrence.endsAt) || a.key.localeCompare(b.key));
  const outcomeOf = (o: Occurrence) => byKey.get(outcomeKey(o.seriesId, o.originalDate));
  return {
    gaps,
    noShows: linkable.filter((o) => outcomeOf(o)?.outcome === "no_show"),
    pendingLogs: linkable.filter((o) => {
      const x = outcomeOf(o);
      return x?.outcome === "delivered" && x.notionLessonId === null;
    }).length,
  };
}

export type UpcomingBadge = "regular" | "trial" | "makeup" | "extra" | "one_off";
export type UpcomingRow = { occurrence: Occurrence; badge: UpcomingBadge };

/** Classes dated today to today + 6 that have not ended, cancelled ones kept and marked, in start order. */
export function upcomingClasses(input: { occurrences: Occurrence[]; today: string; now: Date }): UpcomingRow[] {
  const last = addDays(input.today, 6);
  return input.occurrences
    .filter((o) => o.date >= input.today && o.date <= last && Date.parse(o.endsAt) > input.now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.occurrenceKey.localeCompare(b.occurrenceKey))
    .map((occurrence) => ({ occurrence, badge: occurrence.kind === "weekly" ? "regular" : occurrence.purpose ?? "one_off" }));
}

export type RosterEntry = { staffId: string; teaching: boolean };

/**
 * Active teaching staff (isActiveTeachingStaff over the people copy's `active`, the mapping
 * toStaffRecord uses), plus anyone with a class or availability in the read range, so load is
 * never hidden. With no people read, only the class and availability ids, none teaching.
 */
export function teacherRoster(input: {
  staff: { id: string; active: boolean }[] | null;
  occurrences: Occurrence[];
  availability: StaffAvailability[] | null;
  range: DateRange;
}): RosterEntry[] {
  const teaching = (row: { active: boolean }) => isActiveTeachingStaff({ status: row.active ? "Active" : "Inactive", functions: row.active ? ["Teacher"] : [] });
  const snapshot = new Map((input.staff ?? []).map((s) => [normalId(s.id), s]));
  const out = new Map<string, RosterEntry>();
  for (const s of input.staff ?? []) {
    if (!out.has(normalId(s.id)) && teaching(s)) out.set(normalId(s.id), { staffId: s.id, teaching: true });
  }
  const extra = [
    ...input.occurrences.filter((o) => o.status !== "cancelled" && inRange(o.date, input.range)).map((o) => o.staffId),
    ...(input.availability ?? [])
      .filter((a) => a.windows.some((w) => w.effectiveFrom <= input.range.to && (w.effectiveUntil === null || w.effectiveUntil >= input.range.from))
        || a.exceptions.some((e) => inRange(e.onDate, input.range)))
      .map((a) => a.staffId),
  ];
  for (const id of extra) {
    if (out.has(normalId(id))) continue;
    const row = snapshot.get(normalId(id));
    out.set(normalId(id), { staffId: row?.id ?? id, teaching: row ? teaching(row) : false });
  }
  return [...out.values()];
}
