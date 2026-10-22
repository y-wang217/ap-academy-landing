import type { GaugeData } from "../../components/console/kit/gauge";
import type { MetricData } from "../../components/console/kit/metric";
import type { QueueItem } from "../../components/console/kit/queue-row";
import type { RadarStage } from "../../components/console/kit/radar";
import type { PanelResult } from "../../lib/console/contracts";
import { buildNorthStar } from "../../lib/console/north-star";
import type { ConsolePanels } from "../../lib/console/panel-slots";
import { todayIso } from "../../lib/time";
import { addDays } from "../../lib/domain/schedule/wallclock";
import { weekOf } from "../../lib/domain/schedule/week";
import { notConnected, type PanelStatus, type PanelView } from "../../lib/console/panel-view";
import type { LessonGapsData, TeacherLoadData } from "../../lib/console/operations";
import type { WeekLoad } from "../../lib/domain/schedule/operations";
import type { WorkRow } from "../../lib/console/contracts";
import { creationPanels } from "../../lib/console/creation";

/**
 * Neutral test values for the kit preview and unit tests (REQ-55). Never imported by
 * production source; the console scan allows only app/console/preview/page.preview.tsx.
 * Sales carries one panel per non-ready status, so the preview shows every variant.
 */
const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60_000).toISOString();

function result<T>(panel: string, now: Date, status: PanelStatus, data: T | null, extra: Partial<PanelView<T>> = {}): PanelView<T> {
  return {
    panel,
    status,
    data,
    count: Array.isArray(data) ? data.length : null,
    lastCheckedAt: now.toISOString(),
    lastSuccessfulFetchAt: status === "ready" || status === "empty" ? now.toISOString() : status === "stale" ? minutesAgo(now, 25) : null,
    staleReason: null,
    errorMessage: null,
    sourceEvidence: [],
    ...extra,
  };
}

const leads: QueueItem[] = [
  { id: "lead-a", title: "Lead A", reason: "Trial follow-up due", due: "16:30", href: "#lead-a" },
  { id: "lead-b", title: "Lead B", reason: "Asked for a call back", due: "17:15", href: "#lead-b" },
  { id: "lead-c", title: "Lead C", reason: "First contact", due: "Tomorrow", href: "#lead-c" },
];
const stages: RadarStage[] = [
  { key: "new", label: "New", count: 3 },
  { key: "contacted", label: "Contacted", count: 2 },
  { key: "booked", label: "Call booked", count: 1 },
  { key: "trial", label: "Trial", count: 2 },
  { key: "enrolled", label: "Enrolled", count: 1 },
];

const DEMO_STUDENT = "d0000000-0000-4000-8000-000000000001";
const DEMO_STAFF = "d0000000-0000-4000-8000-0000000000aa";

/** A verified north star over test rows: one addition this week, one the week before. */
function demoNorthStar(now: Date) {
  const week = weekOf(todayIso(now));
  const facade = <T,>(panel: PanelResult<T>["panel"], data: T): PanelResult<T> => ({
    panel, status: "ready", data, count: null, lastCheckedAt: now.toISOString(), lastSuccessfulFetchAt: now.toISOString(), staleReason: null, errorMessage: null, sourceEvidence: [],
  });
  const series = (n: number, startDate: string, durationMinutes: number) => ({
    id: `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, studentId: DEMO_STUDENT, staffId: DEMO_STAFF, kind: "weekly" as const, purpose: null,
    startDate, effectiveUntil: null, durationMinutes, splitFrom: null, createdAt: `${startDate}T15:00:00Z`,
  });
  return buildNorthStar({
    week,
    now,
    panels: {
      leads: facade("leads", []), touches: facade("touches", []), trialLessons: facade("trialLessons", []), work: facade("work", []),
      invoices: facade("invoices", [{ id: "demo-invoice", pageUrl: "#", status: "Paid", paidOn: week.from, amount: null, creditApplied: null, issued: null, due: null, month: null, studentIds: [DEMO_STUDENT], studentName: null }]),
      people: facade("people", { syncedAt: now.toISOString(), students: 1, staff: 1 }),
    },
    people: { ok: true, value: { students: [{ id: DEMO_STUDENT, name: "Student A", stage: "Active", active: true }], staff: [], syncedAt: now.toISOString() } },
    series: { ok: true, value: { series: [series(1, addDays(week.from, -6), 60), series(2, week.from, 90)], adoptions: [{ studentId: DEMO_STUDENT, adoptedAt: "2026-01-05T10:00:00Z" }] } },
  });
}

const week = (from: string, to: string, w: Partial<WeekLoad>): WeekLoad => ({
  from, to, scheduledMinutes: 0, deliveredMinutes: null, availability: "entered", availableMinutes: null, insideMinutes: null, outsideMinutes: null, utilisation: null, ...w,
});

/** Two test teachers: one against entered hours, one with none entered. */
function demoLoad(now: Date): TeacherLoadData {
  const current = weekOf(todayIso(now));
  const next = { from: addDays(current.from, 7), to: addDays(current.to, 7) };
  const label = (r: { from: string; to: string }) => ({ ...r, label: `${r.from} to ${r.to}` });
  return {
    weeks: [label(current), label(next)],
    scheduleHref: "#schedule",
    conflictsHref: "#conflicts",
    rows: [
      {
        staffId: DEMO_STAFF, name: "Teacher A", notTeaching: false, availabilityHref: "#availability",
        weeks: [
          week(current.from, current.to, { scheduledMinutes: 720, deliveredMinutes: 360, availableMinutes: 1200, insideMinutes: 660, outsideMinutes: 60, utilisation: 0.55 }),
          week(next.from, next.to, { scheduledMinutes: 600, availableMinutes: 1200, insideMinutes: 600, outsideMinutes: 0, utilisation: 0.5 }),
        ],
      },
      {
        staffId: "d0000000-0000-4000-8000-0000000000bb", name: "Teacher B", notTeaching: false, availabilityHref: "#availability",
        weeks: [
          week(current.from, current.to, { scheduledMinutes: 240, deliveredMinutes: 120, availability: "not_entered" }),
          week(next.from, next.to, { scheduledMinutes: 240, availability: "not_entered" }),
        ],
      },
    ],
  };
}

function demoGaps(now: Date): LessonGapsData {
  const today = todayIso(now);
  const from = addDays(today, -13);
  const key = (d: string) => `sched:d0000000-0000-4000-8000-000000000001:${d}`;
  return {
    window: { from, to: today, days: 14, label: "Last 14 days" },
    gaps: [{ id: key(addDays(today, -6)), key: key(addDays(today, -6)), title: "Student A with Teacher A, MHF4U", action: "review", reason: "Review", ended: "ended 17:00", href: "#lessons" }],
    moreGaps: 0,
    noShows: [{ id: "ns-1", key: key(addDays(today, -13)), title: "Student A with Teacher A, MHF4U", ended: "ended 17:00", href: "#schedule" }],
    moreNoShows: 0,
    pendingLogs: 1,
    toggle: { href: "?mode=operations&gapDays=31", label: "Show 31 days" },
    unlinkedHref: "#lessons",
  };
}

export function demoPanels(now: Date): ConsolePanels {
  return {
    sales: {
      next: result("next", now, "ready", leads),
      northStar: demoNorthStar(now),
      signals: result<QueueItem[]>("signals", now, "stale", [{ id: "sig-1", title: "Trial with no follow-up", reason: "Lead A, two days" }], { staleReason: "Source slow to answer" }),
      followUps: notConnected("followUps", now),
      radar: result("radar", now, "ready", stages),
      conversion: result<MetricData>("conversion", now, "loading", null),
      capacity: result<GaugeData>("capacity", now, "ready", { value: 18, max: 30, unit: "h" }),
      cashflow: result<MetricData>("cashflow", now, "error", null, { errorMessage: "Payment records unavailable" }),
      dispatch: result<QueueItem[]>("dispatch", now, "empty", null),
    },
    creation: demoCreation(now),
    operations: {
      teacherLoad: result<TeacherLoadData>("teacherLoad", now, "ready", demoLoad(now), { canonical: { href: "#schedule", label: "Open schedule" } }),
      lessonGaps: result<LessonGapsData>("lessonGaps", now, "stale", demoGaps(now), { staleReason: "Lesson candidates unavailable", canonical: { href: "#lessons", label: "Open unlinked lessons" } }),
      upcoming: result<QueueItem[]>("upcoming", now, "ready", [
        { id: "up-1", title: "Student A with Teacher A, MHF4U", reason: "Regular", due: "Thu 16:00", href: "#up-1" },
        { id: "up-2", title: "Student B with Teacher B, SPH3U", reason: "Trial, moved from Tue", due: "Fri 17:30", href: "#up-2" },
      ], { canonical: { href: "#schedule", label: "Open schedule" } }),
      finance: result<MetricData>("finance", now, "stale", { value: 1250, currency: "CAD" }, { staleReason: "Ledger read is 25 minutes old" }),
      trials: result<MetricData>("trials", now, "ready", { value: 4 }),
      integrations: result<QueueItem[]>("integrations", now, "ready", [{ id: "int-1", title: "Notion", reason: "Read in time" }]),
    },
  };
}

/** Creation mode from neutral Work rows (REQ-60): a project with two tasks, a loose task and a weekly review. */
function demoCreation(now: Date): ConsolePanels["creation"] {
  const today = todayIso(now);
  const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const row = (n: number, over: Partial<WorkRow> & { name: string }): WorkRow => ({
    id: id(n), pageUrl: `#work-${n}`, area: "Marketing", state: "Next", type: "Task", dueReview: null, dueReviewDate: null, owner: "Owner A",
    taskTypes: [], parentProjectIds: [], expectedResult: null, ...over,
  });
  const rows: WorkRow[] = [
    row(1, { name: "Video series A", type: "Project", state: "Doing" }),
    row(2, { name: "Video A1 script", parentProjectIds: [id(1)], expectedResult: "A reviewed script", taskTypes: [{ id: id(9), name: "Script" }] }),
    row(3, { name: "Video A2 recording", state: "Defined", parentProjectIds: [id(1)] }),
    row(4, { name: "Course page update", state: "Inbox", owner: null, dueReview: addDays(today, -1), dueReviewDate: addDays(today, -1) }),
    row(5, { name: "Weekly review", type: "Recurring", dueReview: addDays(today, 2), dueReviewDate: addDays(today, 2) }),
  ];
  const work: PanelResult<WorkRow[]> = {
    panel: "work", status: "ready", data: rows, count: rows.length, lastCheckedAt: now.toISOString(), lastSuccessfulFetchAt: now.toISOString(),
    staleReason: null, errorMessage: null, sourceEvidence: [],
  };
  const p = creationPanels(work, { today, selectedId: null, search: new URLSearchParams("mode=creation"), workSourceId: "d0000000-0000-4000-8000-0000000000ff", weeklyReviewId: id(5) });
  return { nextAsset: p.nextAsset, work: p.work, pipeline: p.pipeline, signals: result<QueueItem[]>("signals", now, "ready", [{ id: "sig-2", title: "Worksheet past its date", reason: "Unit 2 review" }]) };
}
