import type { PanelView } from "../../../lib/console/panel-view";
import { InstrumentPanel, type PanelFrame } from "./instrument-panel";

export type RadarStage = { key: string; label: string; count: number };

const C = 100;
const R = 88;
const point = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
};
const sector = (from: number, to: number, r: number) =>
  to - from >= 360
    ? `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C - 0.01} ${C - r} Z`
    : `M ${C} ${C} L ${point(from, r)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to, r)} Z`;

function Rings({ idle = false }: { idle?: boolean }) {
  return (
    <g className="console-rings" data-radar-ring={idle ? "idle" : undefined}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={C} cy={C} r={R * f} />
      ))}
      <path d={`M ${C} ${C - R} V ${C + R} M ${C - R} ${C} H ${C + R}`} />
    </g>
  );
}

/**
 * Lead stages as sectors whose radius follows each stage's count, with a
 * decorative 10 s sweep (CSS, still under reduced motion, paused while
 * hidden) and always a table with the same numbers (REQ-55 AC6).
 */
export function Radar({ label, result, ...frame }: PanelFrame & { label: string; result: PanelView<RadarStage[]> }) {
  const idle = (
    <svg viewBox="0 0 200 200" className="console-radar-dial" aria-hidden="true" focusable="false">
      <Rings idle />
    </svg>
  );
  return (
    <InstrumentPanel {...frame} result={result} idle={idle}>
      {(stages) => {
        if (stages.length === 0) return <p className="console-note">{frame.emptyText}</p>;
        const most = Math.max(1, ...stages.map((s) => s.count));
        const span = 360 / stages.length;
        return (
          <div className="console-radar">
            <svg viewBox="0 0 200 200" className="console-radar-dial" role="img" aria-label={`${label}: ${stages.map((s) => `${s.label} ${s.count}`).join(", ")}`} focusable="false">
              <Rings />
              {stages.map((s, i) => (
                <path key={s.key} d={sector(i * span, (i + 1) * span, 12 + (R - 12) * (s.count / most))} className={`console-sector console-sector-${i % 5}`} />
              ))}
              <g className="console-sweep" aria-hidden="true">
                <path d={sector(0, 40, R)} className="console-sweep-wedge" />
              </g>
            </svg>
            <table data-panel-value="" className="console-stage-table">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Count</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => (
                  <tr key={s.key}>
                    <th scope="row">{s.label}</th>
                    <td className="tabular-nums">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    </InstrumentPanel>
  );
}
