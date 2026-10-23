import type { FunnelPanelData } from "../../lib/console/finance-panels";
import type { PanelView } from "../../lib/console/panel-view";
import type { FunnelCount, FunnelRef } from "../../lib/console/trial-funnel";
import { TUNING } from "../../lib/domain/tuning";
import { InstrumentPanel, type PanelFrame } from "./kit/instrument-panel";

type Variant = "full" | "headline";
type Ok = Extract<FunnelCount, { state: "ok" }>;
const isOk = (c: FunnelCount): c is Ok => c.state === "ok";

/** The Notion link the panel shows in every status: the first Notion source the panel read. */
export function notionHref(result: PanelView<unknown>): string | null {
  return result.sourceEvidence.find((e) => e.source === "notion")?.sourceUrl ?? null;
}

/** A count's rows as a native details list, at most consoleDetailListCap, then "N more in Notion". */
export function RefList({ label, count, notion }: { label: string; count: FunnelCount; notion: string | null }) {
  if (!isOk(count)) {
    return (
      <div className="console-funnel-count" data-funnel-count={label} data-unverifiable="">
        <span>{label}</span> <span>Unverifiable</span> <span className="console-note">{count.reason}</span>
      </div>
    );
  }
  const cap = TUNING.consoleDetailListCap;
  const row = (r: FunnelRef) => (
    <li key={`${r.id}-${r.label ?? ""}`}>
      <a href={r.href} target="_blank" rel="noopener noreferrer">
        {r.name}
      </a>
      {r.date && <span className="tabular-nums">{` ${r.date}`}</span>}
      {r.label && <span className="console-note">{` ${r.label}`}</span>}
    </li>
  );
  return (
    <details className="console-funnel-count" data-funnel-count={label}>
      <summary>
        {`${label} `}
        <span className="tabular-nums">{count.count}</span>
      </summary>
      <ul>
        {count.rows.slice(0, cap).map(row)}
        {count.rows.length > cap && notion && (
          <li>
            <a href={notion} target="_blank" rel="noopener noreferrer">{`${count.rows.length - cap} more in Notion`}</a>
          </li>
        )}
      </ul>
    </details>
  );
}

/** "Delivered 3 of 5 booked": only when both counts exist and the denominator is above 0 (AC7). */
function ratio(top: FunnelCount, topWord: string, bottom: FunnelCount, bottomWord: string): string | null {
  if (!isOk(top) || !isOk(bottom) || bottom.count === 0) return null;
  return `${topWord} ${top.count} of ${bottom.count} ${bottomWord}`;
}

const headlineCount = (c: FunnelCount, word: string) => (isOk(c) ? `${c.count} ${word}` : `${word} unverifiable`);

/**
 * The trial funnel (REQ-59, tracker ADR 0073): booked, delivered, closed, verified enrolments
 * and outcome unknown, each its own count with its rows linked to Notion. Rates only as count
 * over count. The headline variant (Sales) shows the counts and links to Operations.
 */
export function TrialFunnelPanel({ result, variant, ...frame }: PanelFrame & { result: PanelView<FunnelPanelData>; variant: Variant }) {
  const notion = notionHref(result);
  const link = notion ? (
    <p className="console-note">
      <a href={notion} target="_blank" rel="noopener noreferrer" data-notion-link="">
        Open Students &amp; Parents in Notion
      </a>
    </p>
  ) : null;
  return (
    <InstrumentPanel {...frame} result={result} idle={link}>
      {(d) => {
        const windowLine = (
          <p className="console-note" data-window={d.window.days}>
            {`${d.links.label} `}
            {variant === "full" &&
              d.links.others.map((o) => (
                <a key={o.days} href={o.href} className="console-funnel-window">{`${o.days} d`}</a>
              ))}
          </p>
        );
        if (variant === "headline") {
          return (
            <div data-panel-value="" data-funnel="headline">
              <p className="console-readout console-readout-sm tabular-nums">
                {[headlineCount(d.booked, "booked"), headlineCount(d.delivered, "delivered"), headlineCount(d.closed, "closed"), headlineCount(d.verified, "verified")].join(", ")}
              </p>
              {windowLine}
              <p className="console-note">
                <a href={d.links.operations}>Details in Operations</a>
              </p>
              {link}
            </div>
          );
        }
        const ratios = [
          ratio(d.delivered, "Delivered", d.booked, "booked"),
          ratio(d.closed, "Closed", d.delivered, "delivered"),
          ratio(d.verified, "Verified", d.closed, "closed"),
        ].filter((r): r is string => r !== null);
        return (
          <div data-panel-value="" data-funnel="full">
            {windowLine}
            <div className="console-funnel-counts">
              <RefList label="Booked" count={d.booked} notion={notion} />
              <RefList label="Delivered" count={d.delivered} notion={notion} />
              <RefList label="Closed" count={d.closed} notion={notion} />
              <RefList label="Verified enrolments" count={d.verified} notion={notion} />
              <RefList label="Outcome unknown" count={d.outcomeUnknown} notion={notion} />
            </div>
            {ratios.length > 0 && (
              <p className="console-note tabular-nums" data-funnel-ratios="">
                {ratios.join("   ")}
              </p>
            )}
            {link}
          </div>
        );
      }}
    </InstrumentPanel>
  );
}
