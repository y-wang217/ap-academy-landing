import { SessionExpired } from "@/components/console/session-expired";
import { ConsoleBridge } from "@/components/console/shell/bridge";
import { loadConsolePanels } from "@/lib/console/facade";
import { buildCashPulsePanel, buildTrialFunnelPanel } from "@/lib/console/finance-panels";
import { parseGapDays, parseMode, parseWeek, parseWindow } from "@/lib/console/modes";
import { buildNorthStar, CANNOT_VERIFY } from "@/lib/console/north-star";
import { loadOperationsPanels } from "@/lib/console/operations";
import { createOperationsReader } from "@/lib/console/operations-read";
import { placeholderPanels } from "@/lib/console/panel-slots";
import type { PanelView } from "@/lib/console/panel-view";
import { consoleFreshness, createConsoleDeps, createOperationsLessons, sharePeopleRead } from "@/lib/console/providers";
import { buildSalesView, type SalesView } from "@/lib/console/sales-view";
import { createConsoleSeriesReader } from "@/lib/console/series-read";
import { windowOf } from "@/lib/console/trial-funnel";
import { priorWeek } from "@/lib/domain/schedule/net-new";
import { ownerViewer } from "@/lib/pages";
import { todayIso } from "@/lib/time";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

const settle = <T,>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => p.then((value) => ({ ok: true as const, value }), () => ({ ok: false as const }));

/**
 * The founder console (REQ-53 gate, REQ-55 bridge). Owner only, checked again
 * here. One facade load per request. The north star (REQ-56) is wired from
 * it, one shared people read and the series read; the Sales queue and radar
 * (REQ-57) from the same facade result; Operations' teacher load, lesson gaps
 * and upcoming classes and the Sales capacity gauge (REQ-58) from the
 * scheduler tables on the same people read; the trial funnel and cash pulse
 * (REQ-59) from the same facade result. Every other panel is "Not connected
 * yet" until the later Console cards fill their slots.
 */
export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ mode?: string | string[]; week?: string | string[]; gapDays?: string | string[]; window?: string | string[] }> }) {
  const gate = await ownerViewer();
  if (gate.kind === "expired") return <SessionExpired />;
  const sp = await searchParams;
  const mode = parseMode(sp.mode);
  const now = new Date();
  const week = parseWeek(sp.week, todayIso(now));
  const deps = sharePeopleRead(createConsoleDeps(gate.viewer, () => now));
  const readSeries = createConsoleSeriesReader(gate.viewer.db.tracker, gate.viewer.orgId);
  const query = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : Array.isArray(v) && v[0] ? [[k, v[0]]] : [])));
  const [facade, people, series, ops] = await Promise.all([
    loadConsolePanels(deps),
    settle(deps.people()),
    settle(readSeries({ from: priorWeek(week).from, to: week.to })),
    loadOperationsPanels({
      reader: createOperationsReader(gate.viewer, createOperationsLessons()),
      people: deps.people,
      now,
      gapDays: parseGapDays(sp.gapDays),
      orgId: gate.viewer.orgId,
      lessonsSourceId: deps.sources.trialLessons,
      query,
      freshness: consoleFreshness,
      timeoutMs: deps.timeoutMs,
    }),
  ]);
  const panels = placeholderPanels(now);
  try {
    panels.sales.northStar = buildNorthStar({ week, now, panels: facade, people, series });
  } catch {
    panels.sales.northStar = { ...panels.sales.northStar, status: "error", staleReason: null, errorMessage: CANNOT_VERIFY };
  }
  // REQ-57: the same facade result; a throw while building the view gives both slots "Read failed".
  let sales: SalesView;
  try {
    sales = buildSalesView(facade, now);
  } catch {
    const failed = <T,>(panel: string): PanelView<T> => ({
      panel, status: "error", data: null, count: null, lastCheckedAt: now.toISOString(), lastSuccessfulFetchAt: null, staleReason: null, errorMessage: "Read failed", sourceEvidence: [],
    });
    sales = { queue: failed("next"), radar: failed("radar") };
  }
  panels.sales.next = sales.queue;
  panels.sales.radar = sales.radar;
  panels.operations.teacherLoad = ops.teacherLoad;
  panels.operations.lessonGaps = ops.lessonGaps;
  panels.operations.upcoming = ops.upcoming;
  panels.sales.capacity = ops.capacity;
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : Array.isArray(v) && v[0] ? [[k, v[0]]] : [])));
  const trialWindow = windowOf(parseWindow(sp.window), todayIso(now));
  const funnel = buildTrialFunnelPanel(facade, trialWindow, now, search);
  const cash = buildCashPulsePanel(facade, trialWindow, now, search);
  panels.sales.conversion = funnel;
  panels.operations.trials = funnel;
  panels.sales.cashflow = cash;
  panels.operations.finance = cash;
  return <ConsoleBridge mode={mode} panels={panels} sales={sales} email={gate.viewer.email} now={now} />;
}
