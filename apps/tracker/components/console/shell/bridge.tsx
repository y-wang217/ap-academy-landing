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
import { LessonGaps } from "../lesson-gaps";
import { NorthStar } from "../north-star";
import { TeacherLoad } from "../teacher-load";
import type { CreationView } from "../../../lib/console/creation";
import type { LessonGapsData, TeacherLoadData } from "../../../lib/console/operations";
import type { NorthStarData } from "../../../lib/console/north-star";
import { HeaderRail } from "./header-rail";
import { Horizon } from "./horizon";
import { ModePanel } from "./mode-tabs";
import { PhysicalRail } from "./physical-rail";
import { ConsoleRoot } from "./sync-provider";

/** One slot as its instrument. Slot kinds pick the component; the result is the slot's own. */
function Instrument({ slot, result }: { slot: PanelSlot; result: PanelView<unknown> }) {
  const frame = {
    id: slot.id,
    title: slot.title,
    emptyText: slot.emptyText,
    primary: slot.primary,
    retryHref: `?mode=${slot.mode}`,
    headingId: `console-${slot.mode}-${slot.id}-title`,
    canonical: result.canonical,
  };
  if (slot.id === "northStar") return <NorthStar {...frame} result={result as PanelView<NorthStarData>} />;
  if (slot.mode === "operations" && slot.id === "teacherLoad") return <TeacherLoad {...frame} result={result as PanelView<TeacherLoadData>} />;
  if (slot.mode === "operations" && slot.id === "lessonGaps") return <LessonGaps {...frame} result={result as PanelView<LessonGapsData>} />;
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
 * given; the production page passes "Not connected yet" for every slot.
 */
export function ConsoleBridge({ mode, panels, email, now }: { mode: ConsoleMode; panels: ConsolePanels; email?: string; now: Date }) {
  return (
    <ConsoleRoot initialMode={mode}>
      <Horizon />
      <HeaderRail email={email} now={now} />
      <main className="console-main">
        {CONSOLE_MODES.map((m) => (
          <ModePanel key={m} mode={m}>
            {slotsFor(m).map((slot) => (
              <Instrument key={slot.id} slot={slot} result={panels[m][slot.id] ?? notConnected(slot.id, now)} />
            ))}
          </ModePanel>
        ))}
      </main>
      <PhysicalRail connectedByMode={connectedByMode(panels)} />
    </ConsoleRoot>
  );
}
