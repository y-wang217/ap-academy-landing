import { formatReadout } from "../../../lib/console/format";
import type { PanelView } from "../../../lib/console/panel-view";
import { InstrumentPanel, type PanelFrame } from "./instrument-panel";

export type GaugeData = { value: number; max: number; unit: string };

const ARC = "M 15 60 A 45 45 0 0 1 105 60";

/**
 * A half-dial with its text equivalent ("18 of 47 h"). Without a value the
 * dial is an unfilled track: never 0 percent when unknown (PANEL_STATES).
 */
export function Gauge({ result, ...frame }: PanelFrame & { result: PanelView<GaugeData> }) {
  const track = (
    <svg viewBox="0 0 120 66" className="console-gauge-dial" aria-hidden="true" focusable="false">
      <path d={ARC} className="console-gauge-track" pathLength={100} />
    </svg>
  );
  return (
    <InstrumentPanel {...frame} result={result} idle={track}>
      {(d) => {
        const text = `${formatReadout(d.value, {})} of ${formatReadout(d.max, {})} ${d.unit}`;
        const filled = d.max > 0 ? Math.min(Math.max(d.value / d.max, 0), 1) * 100 : 0;
        return (
          <div className="console-gauge">
            <svg viewBox="0 0 120 66" className="console-gauge-dial" role="img" aria-label={`${frame.title}: ${text}`} focusable="false">
              <path d={ARC} className="console-gauge-track" pathLength={100} />
              <path d={ARC} className="console-gauge-fill" pathLength={100} strokeDasharray={`${filled} 100`} />
            </svg>
            <span data-panel-value="" className="console-readout console-readout-sm tabular-nums">
              {text}
            </span>
          </div>
        );
      }}
    </InstrumentPanel>
  );
}
