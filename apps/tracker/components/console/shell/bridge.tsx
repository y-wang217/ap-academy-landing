import { CONSOLE_MODES, type ConsoleMode } from "../../../lib/console/modes";
import { connectedByMode, slotsFor, type ConsolePanels, type PanelSlot } from "../../../lib/console/panel-slots";
import { notConnected, type PanelView } from "../../../lib/console/panel-view";
import { Gauge, type GaugeData } from "../kit/gauge";
import { Metric, type MetricData } from "../kit/metric";
import { QueueList, type QueueItem } from "../kit/queue-row";
import { Radar, type RadarStage } from "../kit/radar";
import type { SalesView } from "../../../lib/console/sales-view";
import { NextLead } from "../sales/next-lead";
import { SalesProvider } from "../sales/sales-provider";
import { SalesRadar } from "../sales/sales-radar";
import { NorthStar } from "../north-star";
import type { NorthStarData } from "../../../lib/console/north-star";
import { HeaderRail } from "./header-rail";
import { Horizon } from "./horizon";
import { ModePanel } from "./mode-tabs";
import { PhysicalRail } from "./physical-rail";
import { ConsoleRoot } from "./sync-provider";

/** One slot as its instrument. Slot kinds pick the component; the result is the slot's own. */
function Instrument({ slot, result, live }: { slot: PanelSlot; result: PanelView<unknown>; live: boolean }) {
  const frame = {
    id: slot.id,
    title: slot.title,
    emptyText: slot.emptyText,
    primary: slot.primary,
    retryHref: `?mode=${slot.mode}`,
    headingId: `console-${slot.mode}-${slot.id}-title`,
  };
  // REQ-57: with a sales view, the Sales queue and radar are live from the SalesProvider.
  if (live && slot.mode === "sales" && slot.id === "next") return <NextLead {...frame} />;
  if (live && slot.mode === "sales" && slot.id === "radar") return <SalesRadar {...frame} />;
  if (slot.id === "northStar") return <NorthStar {...frame} result={result as PanelView<NorthStarData>} />;
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
 * (REQ-57), the Sales grid sits inside the SalesProvider, which adds no DOM.
 */
export function ConsoleBridge({ mode, panels, email, now, sales }: { mode: ConsoleMode; panels: ConsolePanels; email?: string; now: Date; sales?: SalesView }) {
  return (
    <ConsoleRoot initialMode={mode}>
      <Horizon />
      <HeaderRail email={email} now={now} />
      <main className="console-main">
        {CONSOLE_MODES.map((m) => {
          const slots = slotsFor(m).map((slot) => (
            <Instrument key={slot.id} slot={slot} live={sales !== undefined} result={panels[m][slot.id] ?? notConnected(slot.id, now)} />
          ));
          return (
            <ModePanel key={m} mode={m}>
              {m === "sales" && sales ? <SalesProvider initial={sales}>{slots}</SalesProvider> : slots}
            </ModePanel>
          );
        })}
      </main>
      <PhysicalRail connectedByMode={connectedByMode(panels)} />
    </ConsoleRoot>
  );
}
