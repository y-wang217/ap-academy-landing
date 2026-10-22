import { formatReadout } from "../../../lib/console/format";
import type { PanelView } from "../../../lib/console/panel-view";
import { InstrumentPanel, type PanelFrame } from "./instrument-panel";

export type MetricData = { value: number; unit?: string; currency?: "CAD"; delta?: number };

/** One readout, with its change when the source gives one. */
export function Metric({ result, ...frame }: PanelFrame & { result: PanelView<MetricData> }) {
  return (
    <InstrumentPanel {...frame} result={result}>
      {(d) => (
        <p className="console-metric">
          <span data-panel-value="" className="console-readout tabular-nums">
            {formatReadout(d.value, d)}
          </span>
          {d.delta !== undefined && <span className="console-delta tabular-nums">{`${d.delta > 0 ? "+" : ""}${formatReadout(d.delta, { unit: d.unit, currency: d.currency })} this week`}</span>}
        </p>
      )}
    </InstrumentPanel>
  );
}
