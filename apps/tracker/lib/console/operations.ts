import type { GaugeData } from "../../components/console/kit/gauge";
import type { QueueItem } from "../../components/console/kit/queue-row";
import { normalId } from "../domain/billing";
import {
  lessonGaps, teacherLoad, teacherRoster, upcomingClasses, type DateRange, type GapRow, type OutcomeFact, type StaffAvailability, type UpcomingBadge, type WeekLoad,
} from "../domain/schedule/operations";
import { expandOccurrences, type Occurrence } from "../domain/schedule/recurrence";
import { addDays } from "../domain/schedule/wallclock";
import { weekOf } from "../domain/schedule/week";
import { TUNING } from "../domain/tuning";
import { todayIso } from "../time";
import { notionPageUrl, type SourceEvidence } from "./contracts";
import { messageOf, withTimeout, type PeopleSnapshot } from "./facade";
import type { LessonsRead, OperationsReader, ScheduleRead } from "./operations-read";
import type { PanelView } from "./panel-view";
import { dayLabel } from "./north-star";

/**
 * Operations mode, scheduler half (REQ-58): teacher load, lesson-log gaps, upcoming classes and
 * the Sales capacity gauge, from one schedule read expanded once. Every read is capped by the
 * console timeout; one failed read never blanks a panel that does not need it, and unknown is
 * never shown as 0. It never throws and never writes.
 */
export type TeacherLoadRowView = {
  staffId: string;
  name: string;
  notTeaching: boolean;
  weeks: [WeekLoad, WeekLoad];
  availabilityHref: string;
};
export type TeacherLoadData = { weeks: [WeekLabel, WeekLabel]; rows: TeacherLoadRowView[]; scheduleHref: string; conflictsHref: string };
export type WeekLabel = DateRange & { label: string };

export type GapItem = { id: string; key: string; title: string; action: GapRow["nextAction"]; reason: string; ended: string; href: string };
export type NoShowItem = { id: string; key: string; title: string; ended: string; href: string };
export type LessonGapsData = {
  window: DateRange & { days: number; label: string };
  gaps: GapItem[];
  moreGaps: number;
  noShows: NoShowItem[];
  moreNoShows: number;
  pendingLogs: number;
  toggle: { href: string; label: string };
  unlinkedHref: string;
};

export type OperationsPanels = {
  teacherLoad: PanelView<TeacherLoadData>;
  lessonGaps: PanelView<LessonGapsData>;
  upcoming: PanelView<QueueItem[]>;
  capacity: PanelView<GaugeData>;
};

export type OperationsInput = {
  reader: OperationsReader;
  /** The page's shared people read (REQ-56 sharePeopleRead), so the copy is read once per load. */
  people: () => Promise<PeopleSnapshot>;
  now: Date;
  gapDays: number;
  orgId: string;
  /** The Lessons data source id, for the gaps panel's evidence. */
  lessonsSourceId: string;
  /** The page's other query parameters, kept on the window toggle. */
  query: Record<string, string>;
  freshness: Map<string, string>;
  timeoutMs: number;
};

export const LESSONS_NOT_READY = "Lessons is missing Class occurrence";
export const NOT_CONFIGURED = "Notion is not configured";
export const DELIVERED_UNAVAILABLE = "Delivered minutes unavailable";
export const AVAILABILITY_UNAVAILABLE = "Availability unavailable";
export const CANDIDATES_UNAVAILABLE = "Lesson candidates unavailable";
export const ROSTER_UNAVAILABLE = "Teacher roster unavailable";
export const AVAILABILITY_NOT_ENTERED = "Availability not entered";
const PEOPLE_STALE = "people_sync_stale";
const NAMES_UNAVAILABLE = "names_unavailable";

const SCHEDULE = "/tracker/schedule";
const weekHref = (date: string, staffId: string) => `${SCHEDULE}?date=${date}&staffId=${staffId}`;
const unlinkedHref = (r: DateRange) => `${SCHEDULE}/lessons?from=${r.from}&to=${r.to}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const BADGES: Record<UpcomingBadge, string> = { regular: "Regular", trial: "Trial", makeup: "Makeup", extra: "Extra", one_off: "One-off" };

type Settled<T> = { ok: true; value: T } | { ok: false; message: string };

function peopleStale(syncedAt: string | null, now: Date): boolean {
  if (!syncedAt) return true;
  const at = Date.parse(syncedAt);
  return Number.isNaN(at) || now.getTime() - at > TUNING.peopleStaleMinutes * 60_000;
}

const evidence = (ids: string[], at: string): SourceEvidence[] => ids.map((sourceId) => ({ source: "supabase", sourceId, sourceUrl: null, observedAt: at }));

export async function loadOperationsPanels(input: OperationsInput): Promise<OperationsPanels> {
  const { now } = input;
  const checkedAt = now.toISOString();
  const run = async <T>(read: (signal: AbortSignal) => Promise<T>): Promise<Settled<T>> => {
    try {
      return { ok: true, value: await withTimeout(read, input.timeoutMs) };
    } catch (e) {
      return { ok: false, message: messageOf(e, input.timeoutMs) };
    }
  };

  const today = todayIso(now);
  const current = weekOf(today);
  const next = { from: addDays(current.from, 7), to: addDays(current.to, 7) };
  const gapWindow = { from: addDays(today, -(input.gapDays - 1)), to: today };
  const range = { from: gapWindow.from < current.from ? gapWindow.from : current.from, to: next.to };

  const [schedule, availability, lessons, people] = await Promise.all([
    run<ScheduleRead>(() => input.reader.schedule(range)),
    run<StaffAvailability[]>(() => input.reader.availability(range)),
    run<LessonsRead>((signal) => input.reader.unlinkedLessons(gapWindow, signal)),
    run<PeopleSnapshot>(() => input.people()),
  ]);

  const scheduleKey = `${input.orgId}:operations.schedule`;
  const lessonsKey = `${input.orgId}:operations.lessons`;
  if (schedule.ok) input.freshness.set(scheduleKey, checkedAt);
  const lessonsUsable = lessons.ok && lessons.value.ok;
  if (lessonsUsable) input.freshness.set(lessonsKey, checkedAt);

  const occurrences: Occurrence[] = schedule.ok ? expandOccurrences(schedule.value.series, schedule.value.exceptions, range) : [];
  const ended = (o: Occurrence) => o.status !== "cancelled" && Date.parse(o.endsAt) <= now.getTime();
  const inRange = (o: Occurrence, r: DateRange) => o.date >= r.from && o.date <= r.to;
  const keys = occurrences.filter((o) => ended(o) && (inRange(o, current) || inRange(o, gapWindow))).map((o) => ({ seriesId: o.seriesId, originalDate: o.originalDate }));
  const outcomes: Settled<OutcomeFact[]> = schedule.ok ? await run(() => input.reader.outcomes(keys)) : { ok: false, message: schedule.message };

  const staffNames = new Map(people.ok ? people.value.staff.map((s) => [normalId(s.id), s.name]) : []);
  const studentNames = new Map(people.ok ? people.value.students.map((s) => [normalId(s.id), s.name]) : []);
  const nameReason = !people.ok ? NAMES_UNAVAILABLE : peopleStale(people.value.syncedAt, now) ? PEOPLE_STALE : null;
  const staffName = (id: string) => staffNames.get(normalId(id)) ?? "Unknown teacher";
  const studentName = (id: string) => studentNames.get(normalId(id)) ?? "Unknown student";
  const title = (o: Occurrence) => `${studentName(o.studentId)} with ${staffName(o.staffId)}, ${o.subject}`;
  const when = (o: Occurrence) => `${dayLabel(o.date)} ${o.startTime}`;
  const endedAt = (o: Occurrence) => `ended ${dayLabel(o.date)} ${o.endTime}`;

  const base = (panel: string, ids: string[], canonical: { href: string; label: string }, key = scheduleKey) => ({
    panel, lastCheckedAt: checkedAt, sourceEvidence: evidence(ids, checkedAt), canonical,
    lastSuccessfulFetchAt: input.freshness.get(key) ?? null,
  });
  const failed = <T>(b: ReturnType<typeof base>, message: string): PanelView<T> => ({ ...b, status: "error", data: null, count: null, staleReason: null, errorMessage: message });
  const withStatus = <T>(b: ReturnType<typeof base>, data: T, count: number, reasons: string[], emptyNow: boolean): PanelView<T> => {
    const status = reasons.length ? "stale" : emptyNow ? "empty" : "ready";
    return { ...b, status, data, count, staleReason: reasons.length ? reasons.join("; ") : null, errorMessage: null };
  };
  const guard = <T>(b: ReturnType<typeof base>, build: () => PanelView<T>): PanelView<T> => {
    try {
      return build();
    } catch {
      return failed<T>(b, "Read failed");
    }
  };

  const loadTables = ["tracker.class_series", "tracker.class_exceptions", "tracker.availability_windows", "tracker.availability_exceptions", "tracker.occurrence_outcomes", "tracker.staff"];
  const loadBase = base("teacherLoad", loadTables, { href: SCHEDULE, label: "Open schedule" });
  const roster = schedule.ok ? teacherRoster({ staff: people.ok ? people.value.staff : null, occurrences, availability: availability.ok ? availability.value : null, range }) : [];
  const loadRows = schedule.ok
    ? teacherLoad({
        staffIds: roster.map((r) => r.staffId), occurrences, current, next,
        availability: availability.ok ? availability.value : null, outcomes: outcomes.ok ? outcomes.value : null, now,
      })
    : [];

  const teacherLoadPanel = guard<TeacherLoadData>(loadBase, () => {
    if (!schedule.ok) return failed(loadBase, schedule.message);
    if (!people.ok && roster.length === 0) {
      return { ...loadBase, status: "unverifiable", data: null, count: null, staleReason: ROSTER_UNAVAILABLE, errorMessage: null };
    }
    const teachingOf = new Map(roster.map((r) => [normalId(r.staffId), r.teaching]));
    const rows = loadRows
      .map((r): TeacherLoadRowView => ({
        staffId: r.staffId,
        name: staffName(r.staffId),
        notTeaching: staffNames.has(normalId(r.staffId)) && !teachingOf.get(normalId(r.staffId)),
        weeks: r.weeks,
        availabilityHref: `${SCHEDULE}/availability?staffId=${r.staffId}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.staffId.localeCompare(b.staffId));
    const reasons = [
      ...(availability.ok ? [] : [AVAILABILITY_UNAVAILABLE]),
      ...(outcomes.ok ? [] : [DELIVERED_UNAVAILABLE]),
      ...(nameReason ? [nameReason] : []),
    ];
    const label = (r: DateRange): WeekLabel => ({ ...r, label: `${dayLabel(r.from)} to ${dayLabel(r.to)}` });
    const data: TeacherLoadData = { weeks: [label(current), label(next)], rows, scheduleHref: SCHEDULE, conflictsHref: `${SCHEDULE}/conflicts` };
    return withStatus(loadBase, data, rows.length, rows.length === 0 && people.ok ? [] : reasons, rows.length === 0);
  });

  const gapsBase = {
    ...base("lessonGaps", ["tracker.class_series", "tracker.class_exceptions", "tracker.occurrence_outcomes"], { href: unlinkedHref(gapWindow), label: "Open unlinked lessons" }, lessonsKey),
  };
  gapsBase.sourceEvidence.push({ source: "notion", sourceId: input.lessonsSourceId, sourceUrl: notionPageUrl(input.lessonsSourceId), observedAt: checkedAt });
  const lessonGapsPanel = guard<LessonGapsData>(gapsBase, () => {
    if (!schedule.ok) return failed(gapsBase, schedule.message);
    if (!outcomes.ok) return failed(gapsBase, outcomes.message);
    if (lessons.ok && !lessons.value.ok && lessons.value.code === "not_configured") return failed(gapsBase, NOT_CONFIGURED);
    if (lessons.ok && !lessons.value.ok && lessons.value.code === "lessons_not_ready") return failed(gapsBase, LESSONS_NOT_READY);
    const rows = lessons.ok && lessons.value.ok ? lessons.value.rows : null;
    const result = lessonGaps({ occurrences, window: gapWindow, today, now, outcomes: outcomes.value, lessons: rows });
    const cap = TUNING.consoleOperationsListCap;
    const gaps = result.gaps.map((g): GapItem => ({
      id: g.key,
      key: g.key,
      title: title(g.occurrence),
      action: g.nextAction,
      reason: g.nextAction === "log" ? "Log" : g.nextAction === "link" ? `Link existing lesson (${plural(g.candidates ?? 0, "candidate")})` : "Review",
      ended: endedAt(g.occurrence),
      href: g.nextAction === "log" ? weekHref(g.occurrence.date, g.occurrence.staffId) : unlinkedHref(gapWindow),
    }));
    const noShows = result.noShows.map((o): NoShowItem => ({ id: o.occurrenceKey, key: `sched:${o.seriesId}:${o.originalDate}`, title: title(o), ended: endedAt(o), href: weekHref(o.date, o.staffId) }));
    const other = input.gapDays === 31 ? 14 : 31;
    const toggle = { href: `?${new URLSearchParams({ ...input.query, mode: "operations", gapDays: String(other) })}`, label: `Show ${other} days` };
    const data: LessonGapsData = {
      window: { ...gapWindow, days: input.gapDays, label: `Last ${plural(input.gapDays, "day")}` },
      gaps: gaps.slice(0, cap), moreGaps: Math.max(0, gaps.length - cap),
      noShows: noShows.slice(0, cap), moreNoShows: Math.max(0, noShows.length - cap),
      pendingLogs: result.pendingLogs, toggle, unlinkedHref: unlinkedHref(gapWindow),
    };
    const nothing = gaps.length === 0 && noShows.length === 0 && result.pendingLogs === 0;
    const reasons = [...(rows === null ? [CANDIDATES_UNAVAILABLE] : []), ...(nameReason && !nothing ? [nameReason] : [])];
    return withStatus(gapsBase, data, gaps.length, reasons, nothing);
  });

  const upcomingBase = base("upcoming", ["tracker.class_series", "tracker.class_exceptions"], { href: SCHEDULE, label: "Open schedule" });
  const upcomingPanel = guard<QueueItem[]>(upcomingBase, () => {
    if (!schedule.ok) return failed(upcomingBase, schedule.message);
    const rows = upcomingClasses({ occurrences, today, now });
    const cap = TUNING.consoleOperationsListCap;
    const items: QueueItem[] = rows.slice(0, cap).map(({ occurrence: o, badge }) => ({
      id: o.occurrenceKey,
      title: title(o),
      reason: `${BADGES[badge]}${o.status === "moved" ? `, moved from ${dayLabel(o.originalDate)}` : o.status === "cancelled" ? ", cancelled" : ""}`,
      due: when(o),
      href: weekHref(o.date, o.staffId),
    }));
    if (rows.length > cap) items.push({ id: "more", title: `${rows.length - cap} more`, reason: "In the schedule", href: SCHEDULE });
    return withStatus(upcomingBase, items, rows.length, rows.length && nameReason ? [nameReason] : [], rows.length === 0);
  });

  const capacityBase = base("capacity", ["tracker.class_series", "tracker.class_exceptions", "tracker.availability_windows", "tracker.availability_exceptions", "tracker.staff"], { href: `${SCHEDULE}/availability`, label: "Open availability" });
  const capacityPanel = guard<GaugeData>(capacityBase, () => {
    if (!schedule.ok) return failed(capacityBase, schedule.message);
    if (!availability.ok) return failed(capacityBase, availability.message);
    if (roster.length === 0) {
      return people.ok
        ? { ...capacityBase, status: "empty", data: null, count: 0, staleReason: null, errorMessage: null }
        : { ...capacityBase, status: "unverifiable", data: null, count: null, staleReason: ROSTER_UNAVAILABLE, errorMessage: null };
    }
    const entered = loadRows.filter((r) => r.weeks[0].availability === "entered");
    if (entered.length === 0) return { ...capacityBase, status: "unverifiable", data: null, count: null, staleReason: AVAILABILITY_NOT_ENTERED, errorMessage: null };
    const sum = (f: (w: WeekLoad) => number | null) => entered.reduce((n, r) => n + (f(r.weeks[0]) ?? 0), 0);
    const data: GaugeData = { value: sum((w) => w.insideMinutes) / 60, max: sum((w) => w.availableMinutes) / 60, unit: "h" };
    const left = loadRows.length - entered.length;
    return withStatus(capacityBase, data, entered.length, left ? [`${plural(left, "teacher")} without availability not counted`] : [], false);
  });

  return { teacherLoad: teacherLoadPanel, lessonGaps: lessonGapsPanel, upcoming: upcomingPanel, capacity: capacityPanel };
}
