import type { GaugeData } from "../../components/console/kit/gauge";
import type { QueueItem } from "../../components/console/kit/queue-row";
import type { RadarStage } from "../../components/console/kit/radar";
import type { PanelResult } from "../../lib/console/contracts";
import { buildCashPulsePanel, buildTrialFunnelPanel } from "../../lib/console/finance-panels";
import { buildNorthStar } from "../../lib/console/north-star";
import { windowOf } from "../../lib/console/trial-funnel";
import type { ConsolePanels } from "../../lib/console/panel-slots";
import type { ConsolePanels as ConsolePanelResults } from "../../lib/console/contracts";
import { todayIso } from "../../lib/time";
import { addDays } from "../../lib/domain/schedule/wallclock";
import { weekOf } from "../../lib/domain/schedule/week";
import { notConnected, type PanelStatus, type PanelView } from "../../lib/console/panel-view";
import { buildSalesView, type SalesView } from "../../lib/console/sales-view";
import { fixtureLeads, TRIAL_F } from "./sales-fixtures";
import type { LessonGapsData, TeacherLoadData } from "../../lib/console/operations";
import type { WeekLoad } from "../../lib/domain/schedule/operations";

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

/** The funnel and cash pulse over test rows: two leads, one trial lesson, three invoices. */
function demoFinance(now: Date) {
  const today = todayIso(now);
  const window = windowOf(30, today);
  const day = (n: number) => addDays(today, n);
  const ok = <T,>(panel: PanelResult<T>["panel"], data: T): PanelResult<T> => ({
    panel, status: "ready", data, count: null, lastCheckedAt: now.toISOString(), lastSuccessfulFetchAt: now.toISOString(), staleReason: null, errorMessage: null,
    sourceEvidence: [{ source: "notion", sourceId: `demo-${panel}`, sourceUrl: "#notion", observedAt: now.toISOString() }],
  });
  const lead = (n: number, extra: Record<string, string | null>) => ({
    id: `d0000000-0000-4000-8000-00000000010${n}`, pageUrl: "#lead", createdAt: null, name: `Lead ${n}`, stage: null, ownerStaffId: null, ownerName: null, nextAction: null,
    nextActionDue: null, nextActionDueDate: null, attempts: null, lastContact: null, source: null, lostReason: null, contactedAt: null, trialBookedAt: null,
    trialAttendedAt: null, closedAt: null, trialTime: null, trialTimeDate: null, trialTeacherId: null, trialTeacherName: null, level: null, hasMajorGaps: false,
    recommendedPlan: null, hasTrialSummary: false, parentName: null, inPeopleCopy: true, dedupeKey: null, grade: null, subjects: [], majorGaps: null, trialSummary: null, ...extra,
  });
  const invoice = (n: number, status: string, amount: number, extra: Record<string, string | number | null> = {}) => ({
    id: `d0000000-0000-4000-8000-00000000020${n}`, pageUrl: "#invoice", status, paidOn: null, amount, creditApplied: null, issued: day(-10), due: null, month: null,
    studentIds: [lead(1, {}).id], studentName: "Lead 1", ...extra,
  });
  const leads = [
    lead(1, { trialBookedAt: day(-12), trialAttendedAt: day(-9), closedAt: day(-5), trialTime: `${day(-9)}T20:00:00Z` }),
    lead(2, { trialBookedAt: day(-6), trialTime: `${day(-3)}T20:00:00Z` }),
  ];
  const panels = {
    leads: ok("leads", leads), touches: ok("touches", []), work: ok("work", []), people: ok("people", { syncedAt: now.toISOString(), students: 2, staff: 1 }),
    trialLessons: ok("trialLessons", [{ id: "d0000000-0000-4000-8000-000000000301", pageUrl: "#lesson", date: day(-9), studentId: leads[0].id, studentName: null, teacherId: null, teacherName: null, durationHours: 1, hasTopic: false, hasDiagnosis: false, diagnosis: null, preferredDays: [] }]),
    invoices: ok("invoices", [invoice(1, "Paid", 480, { paidOn: day(-4) }), invoice(2, "Sent", 420, { due: day(-1) }), invoice(3, "Draft", 315)]),
  };
  const search = new URLSearchParams({ mode: "operations" });
  return { funnel: buildTrialFunnelPanel(panels, window, now, search), cash: buildCashPulsePanel(panels, window, now, search) };
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
  const finance = demoFinance(now);
  return {
    sales: {
      next: result("next", now, "ready", leads),
      northStar: demoNorthStar(now),
      signals: result<QueueItem[]>("signals", now, "stale", [{ id: "sig-1", title: "Trial with no follow-up", reason: "Lead A, two days" }], { staleReason: "Source slow to answer" }),
      followUps: notConnected("followUps", now),
      radar: result("radar", now, "ready", stages),
      conversion: finance.funnel,
      capacity: result<GaugeData>("capacity", now, "ready", { value: 18, max: 30, unit: "h" }),
      cashflow: finance.cash,
      dispatch: result<QueueItem[]>("dispatch", now, "empty", null),
    },
    creation: {
      nextAsset: result<QueueItem[]>("nextAsset", now, "ready", [
        { id: "asset-1", title: "Unit 3 worksheet", reason: "Due before Thursday class", due: "Thu", href: "#asset-1" },
        { id: "asset-2", title: "Trial lesson plan", reason: "Lead B trial", due: "Fri", href: "#asset-2" },
      ]),
      work: result<QueueItem[]>("work", now, "ready", [{ id: "work-1", title: "Course outline draft", reason: "In progress", href: "#work-1" }]),
      pipeline: result<QueueItem[]>("pipeline", now, "empty", null),
      signals: result<QueueItem[]>("signals", now, "ready", [{ id: "sig-2", title: "Worksheet past its date", reason: "Unit 2 review" }]),
    },
    operations: {
      teacherLoad: result<TeacherLoadData>("teacherLoad", now, "ready", demoLoad(now), { canonical: { href: "#schedule", label: "Open schedule" } }),
      lessonGaps: result<LessonGapsData>("lessonGaps", now, "stale", demoGaps(now), { staleReason: "Lesson candidates unavailable", canonical: { href: "#lessons", label: "Open unlinked lessons" } }),
      upcoming: result<QueueItem[]>("upcoming", now, "ready", [
        { id: "up-1", title: "Student A with Teacher A, MHF4U", reason: "Regular", due: "Thu 16:00", href: "#up-1" },
        { id: "up-2", title: "Student B with Teacher B, SPH3U", reason: "Trial, moved from Tue", due: "Fri 17:30", href: "#up-2" },
      ], { canonical: { href: "#schedule", label: "Open schedule" } }),
      finance: finance.cash,
      trials: finance.funnel,
      integrations: result<QueueItem[]>("integrations", now, "ready", [{ id: "int-1", title: "Notion", reason: "Read in time" }]),
    },
  };
}

/** REQ-57: a Sales queue and radar from the ranking fixtures, for the preview's NEXT and radar slots. */
export function demoSales(now: Date): SalesView {
  const at = now.toISOString();
  const r = <T,>(panel: string, data: T) => ({ panel, status: "ready", data, count: null, lastCheckedAt: at, lastSuccessfulFetchAt: at, staleReason: null, errorMessage: null, sourceEvidence: [] });
  return buildSalesView({
    leads: r("leads", fixtureLeads()), touches: r("touches", []), trialLessons: r("trialLessons", [TRIAL_F]), work: r("work", []), invoices: r("invoices", []),
    people: r("people", { syncedAt: at, students: 0, staff: 0 }),
  } as ConsolePanelResults, now);
}
