import { SessionExpired } from "@/components/console/session-expired";
import { ConsoleBridge } from "@/components/console/shell/bridge";
import { loadConsolePanels } from "@/lib/console/facade";
import { buildCashPulsePanel, buildTrialFunnelPanel } from "@/lib/console/finance-panels";
import { parseMode, parseWeek, parseWindow } from "@/lib/console/modes";
import { buildNorthStar, CANNOT_VERIFY } from "@/lib/console/north-star";
import { placeholderPanels } from "@/lib/console/panel-slots";
import { createConsoleDeps, sharePeopleRead } from "@/lib/console/providers";
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
 * here. The north star (REQ-56) is wired from the facade, one shared people
 * read and the series read; the trial funnel and cash pulse (REQ-59) from
 * the same facade result. Every other panel is "Not connected yet" until the
 * later Console cards fill their slots.
 */
export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ mode?: string | string[]; week?: string | string[]; window?: string | string[] }> }) {
  const gate = await ownerViewer();
  if (gate.kind === "expired") return <SessionExpired />;
  const sp = await searchParams;
  const mode = parseMode(sp.mode);
  const now = new Date();
  const week = parseWeek(sp.week, todayIso(now));
  const deps = sharePeopleRead(createConsoleDeps(gate.viewer, () => now));
  const readSeries = createConsoleSeriesReader(gate.viewer.db.tracker, gate.viewer.orgId);
  const [facade, people, series] = await Promise.all([
    loadConsolePanels(deps),
    settle(deps.people()),
    settle(readSeries({ from: priorWeek(week).from, to: week.to })),
  ]);
  const panels = placeholderPanels(now);
  try {
    panels.sales.northStar = buildNorthStar({ week, now, panels: facade, people, series });
  } catch {
    panels.sales.northStar = { ...panels.sales.northStar, status: "error", staleReason: null, errorMessage: CANNOT_VERIFY };
  }
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : Array.isArray(v) && v[0] ? [[k, v[0]]] : [])));
  const trialWindow = windowOf(parseWindow(sp.window), todayIso(now));
  const funnel = buildTrialFunnelPanel(facade, trialWindow, now, search);
  const cash = buildCashPulsePanel(facade, trialWindow, now, search);
  panels.sales.conversion = funnel;
  panels.operations.trials = funnel;
  panels.sales.cashflow = cash;
  panels.operations.finance = cash;
  return <ConsoleBridge mode={mode} panels={panels} email={gate.viewer.email} now={now} />;
}
