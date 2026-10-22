import type { GaugeData } from "../../components/console/kit/gauge";
import type { MetricData } from "../../components/console/kit/metric";
import type { QueueItem } from "../../components/console/kit/queue-row";
import type { RadarStage } from "../../components/console/kit/radar";
import type { ConsolePanels } from "../../lib/console/panel-slots";
import type { ConsolePanels as ConsolePanelResults } from "../../lib/console/contracts";
import { notConnected, type PanelStatus, type PanelView } from "../../lib/console/panel-view";
import { buildSalesView, type SalesView } from "../../lib/console/sales-view";
import { fixtureLeads, TRIAL_F } from "./sales-fixtures";

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

export function demoPanels(now: Date): ConsolePanels {
  return {
    sales: {
      next: result("next", now, "ready", leads),
      northStar: result<MetricData>("northStar", now, "ready", { value: 6, unit: "h", delta: 2 }),
      signals: result<QueueItem[]>("signals", now, "stale", [{ id: "sig-1", title: "Trial with no follow-up", reason: "Lead A, two days" }], { staleReason: "Source slow to answer" }),
      followUps: notConnected("followUps", now),
      radar: result("radar", now, "ready", stages),
      conversion: result<MetricData>("conversion", now, "loading", null),
      capacity: result<GaugeData>("capacity", now, "ready", { value: 18, max: 30, unit: "h" }),
      cashflow: result<MetricData>("cashflow", now, "error", null, { errorMessage: "Payment records unavailable" }),
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
      teacherLoad: result<GaugeData>("teacherLoad", now, "ready", { value: 22, max: 40, unit: "h" }),
      lessonGaps: result<QueueItem[]>("lessonGaps", now, "ready", [{ id: "gap-1", title: "Tuesday class", reason: "No lesson logged", href: "#gap-1" }]),
      finance: result<MetricData>("finance", now, "stale", { value: 1250, currency: "CAD" }, { staleReason: "Ledger read is 25 minutes old" }),
      trials: result<MetricData>("trials", now, "ready", { value: 4 }),
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
