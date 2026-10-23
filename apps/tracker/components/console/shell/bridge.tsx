import { CONSOLE_MODES, type ConsoleMode } from "../../../lib/console/modes";
import { connectedByMode, slotsFor, type ConsolePanels, type PanelSlot } from "../../../lib/console/panel-slots";
import { notConnected, type PanelView } from "../../../lib/console/panel-view";
import { NextAsset } from "../creation/next-asset";
import { WeeklyReview } from "../creation/weekly-review";
import { WorkQueue } from "../creation/work-queue";
import { Gauge, type GaugeData } from "../kit/gauge";
import { Metric, type MetricData } from "../kit/metric";
import { QueueList, type QueueItem } from "../kit/queue-row";
import { Radar, type RadarStage } from "../kit/radar";
import type { SalesView } from "../../../lib/console/sales-view";
import { NextLead } from "../sales/next-lead";
import { SalesProvider } from "../sales/sales-provider";
import { SalesRadar } from "../sales/sales-radar";
import { CashPulsePanel } from "../cash-pulse";
import { LessonGaps } from "../lesson-gaps";
import { NorthStar } from "../north-star";
import { TeacherLoad } from "../teacher-load";
import { TrialFunnelPanel } from "../trial-funnel";
import type { CashPanelData, FunnelPanelData } from "../../../lib/console/finance-panels";
import type { CreationView } from "../../../lib/console/creation";
import type { LessonGapsData, TeacherLoadData } from "../../../lib/console/operations";
import type { NorthStarData } from "../../../lib/console/north-star";
import type { SignalsView } from "../../../lib/console/signals";
import { HealthPanel } from "../signals/health-rail";
import { SignalBand } from "../signals/signal-band";
import { SignalList } from "../signals/signal-list";
import { SignalsProvider } from "../signals/signals-provider";
import { HeaderRail } from "./header-rail";
import { Horizon } from "./horizon";
import { ModePanel } from "./mode-tabs";
import { PhysicalRail } from "./physical-rail";
import { ConsoleRoot } from "./sync-provider";

/** One slot as its instrument. Slot kinds pick the component; the result is the slot's own. */
function Instrument({ slot, result, live, signals }: { slot: PanelSlot; result: PanelView<unknown>; live: boolean; signals: boolean }) {
  const frame = {
    id: slot.id,
    title: slot.title,
    emptyText: slot.emptyText,
    primary: slot.primary,
    retryHref: `?mode=${slot.mode}`,
    headingId: `console-${slot.mode}-${slot.id}-title`,
    canonical: result.canonical,
  };
  // REQ-57: with a sales view, the Sales queue and radar are live from the SalesProvider.
  if (live && slot.mode === "sales" && slot.id === "next") return <NextLead {...frame} />;
  if (live && slot.mode === "sales" && slot.id === "radar") return <SalesRadar {...frame} />;
  // REQ-62: with a signals view, every signals slot and the integrations slot are live from the SignalsProvider.
  if (signals && slot.id === "signals") return <SignalList {...frame} />;
  if (signals && slot.id === "integrations") return <HealthPanel {...frame} />;
  if (slot.id === "northStar") return <NorthStar {...frame} result={result as PanelView<NorthStarData>} />;
  if (slot.mode === "operations" && slot.id === "teacherLoad") return <TeacherLoad {...frame} result={result as PanelView<TeacherLoadData>} />;
  if (slot.mode === "operations" && slot.id === "lessonGaps") return <LessonGaps {...frame} result={result as PanelView<LessonGapsData>} />;
  if (slot.id === "conversion" || slot.id === "trials") {
    return <TrialFunnelPanel {...frame} variant={slot.id === "trials" ? "full" : "headline"} result={result as PanelView<FunnelPanelData>} />;
  }
  if (slot.id === "cashflow" || slot.id === "finance") {
    return <CashPulsePanel {...frame} variant={slot.id === "finance" ? "full" : "headline"} result={result as PanelView<CashPanelData>} />;
  }
  if (slot.mode === "creation" && slot.id === "nextAsset") return <NextAsset {...frame} result={result as PanelView<CreationView>} />;
  if (slot.mode === "creation" && slot.id === "work") return <WorkQueue {...frame} result={result as PanelView<CreationView>} />;
  if (slot.mode === "creation" && slot.id === "pipeline") return <WeeklyReview {...frame} result={result as PanelView<CreationView>} />;
  switch (slot.kind) {
    case "metric":
      return <Metric {...frame} result={result as PanelView<MetricData>} />;
    case "gauge":
      return <Gauge {...frame} result={result as PanelView<GaugeData>} />;
    case "radar":
      return <Radar {...frame} label="Lead stages" result={result as PanelView<RadarStage[]>} />;
    case "queue":
      return <QueueList {...frame} result={result as PanelView<QueueItem[]>} />;
    case "list":
      return <QueueList {...frame} selectFirst={false} result={result as PanelView<QueueItem[]>} />;
  }
}

/**
 * The founder console's command bridge (REQ-55, tracker ADR 0066): horizon,
 * header rail, one panel grid per mode (DOM in slot order, placed by
 * console.css), and the physical rail. It renders whatever results it is
 * given; a slot no card has wired is "Not connected yet". With `sales`
 * (REQ-57), the whole bridge sits inside the SalesProvider, which adds no DOM,
 * so the signal band can select a lead; `lead` is ?lead=. With `signals`
 * (REQ-62), the SignalsProvider adds the fresh-lead band under the header, the
 * signals and integrations slots, quiet mode and the rail's health strip.
 */
export function ConsoleBridge({
  mode, panels, email, now, sales, signals, orgId = "", lead = null,
}: { mode: ConsoleMode; panels: ConsolePanels; email?: string; now: Date; sales?: SalesView; signals?: SignalsView; orgId?: string; lead?: string | null }) {
  const bridge = (
    <>
      <Horizon />
      <HeaderRail email={email} now={now} />
      {signals && <SignalBand />}
      <main className="console-main">
        {CONSOLE_MODES.map((m) => (
          <ModePanel key={m} mode={m}>
            {slotsFor(m).map((slot) => (
              <Instrument key={slot.id} slot={slot} live={sales !== undefined} signals={signals !== undefined} result={panels[m][slot.id] ?? notConnected(slot.id, now)} />
            ))}
          </ModePanel>
        ))}
      </main>
      <PhysicalRail connectedByMode={connectedByMode(panels)} />
    </>
  );
  const withSales = sales ? <SalesProvider initial={sales} lead={lead}>{bridge}</SalesProvider> : bridge;
  return <ConsoleRoot initialMode={mode}>{signals ? <SignalsProvider initial={signals} orgId={orgId}>{withSales}</SignalsProvider> : withSales}</ConsoleRoot>;
}
