import type { InvoiceRef, MoneyLine } from "../../lib/console/cash-pulse";
import type { CashPanelData } from "../../lib/console/finance-panels";
import { formatCents } from "../../lib/console/format";
import type { PanelView } from "../../lib/console/panel-view";
import { TUNING } from "../../lib/domain/tuning";
import { InstrumentPanel, type PanelFrame } from "./kit/instrument-panel";
import { notionHref } from "./trial-funnel";

export const CARD_PAYMENTS_FOOTNOTE = "Card payments made through the website's payment links are not recorded in Notion and are not included.";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Rows({ rows, notion }: { rows: InvoiceRef[]; notion: string | null }) {
  const cap = TUNING.consoleDetailListCap;
  return (
    <ul>
      {rows.slice(0, cap).map((r) => (
        <li key={r.id}>
          <a href={r.href} target="_blank" rel="noopener noreferrer">
            {r.studentName ?? r.month ?? "Invoice"}
          </a>
          {r.date && <span className="tabular-nums">{` ${r.date}`}</span>}
          {r.cents !== null && <span className="tabular-nums">{` ${formatCents(r.cents)}`}</span>}
          {r.label && <span className="console-note">{` ${r.label}`}</span>}
        </li>
      ))}
      {rows.length > cap && notion && (
        <li>
          <a href={notion} target="_blank" rel="noopener noreferrer">{`${rows.length - cap} more in Notion`}</a>
        </li>
      )}
    </ul>
  );
}

/** One money figure and its rows as a native details list (AC8). */
function Money({ label, line, extra, notion }: { label: string; line: MoneyLine; extra?: string; notion: string | null }) {
  return (
    <details className="console-cash-line" data-cash-line={label}>
      <summary>
        {`${label} `}
        <span className="tabular-nums">{formatCents(line.cents)}</span>
        <span className="console-note">{` ${plural(line.rows.length, "invoice")}${extra ? ` (${extra})` : ""}`}</span>
      </summary>
      <Rows rows={line.rows} notion={notion} />
    </details>
  );
}

function Listed({ label, rows, notion }: { label: string; rows: InvoiceRef[]; notion: string | null }) {
  if (rows.length === 0) return null;
  return (
    <details className="console-cash-line" data-cash-list={label}>
      <summary>{`${label} ${rows.length}`}</summary>
      <Rows rows={rows} notion={notion} />
    </details>
  );
}

/**
 * The cash pulse (REQ-59, tracker ADR 0073): collected from Paid invoices only, outstanding Sent
 * split into due and overdue, drafts and voids as counts, and credits applied, in CAD with two
 * decimals. A missing amount or date is listed, never summed. The headline variant (Sales) shows
 * collected and overdue and links to Operations.
 */
export function CashPulsePanel({ result, variant, ...frame }: PanelFrame & { result: PanelView<CashPanelData>; variant: "full" | "headline" }) {
  const notion = notionHref(result);
  const link = notion ? (
    <p className="console-note">
      <a href={notion} target="_blank" rel="noopener noreferrer" data-notion-link="">
        Open Invoices in Notion
      </a>
    </p>
  ) : null;
  return (
    <InstrumentPanel {...frame} result={result} idle={link}>
      {(d) => {
        if (variant === "headline") {
          return (
            <div data-panel-value="" data-cash="headline">
              <p className="console-readout console-readout-sm tabular-nums">{`${formatCents(d.collected.cents)} collected, ${formatCents(d.outstandingOverdue.cents)} overdue`}</p>
              <p className="console-note">{d.links.label}</p>
              <p className="console-note">
                <a href={d.links.operations}>Details in Operations</a>
              </p>
              {link}
            </div>
          );
        }
        const missing = [...d.collected.missingAmount, ...d.outstandingDue.missingAmount, ...d.outstandingOverdue.missingAmount];
        return (
          <div data-panel-value="" data-cash="full">
            <p className="console-note" data-window={d.window.days}>
              {`${d.links.label} `}
              {d.links.others.map((o) => (
                <a key={o.days} href={o.href} className="console-funnel-window">{`${o.days} d`}</a>
              ))}
            </p>
            <Money label="Collected" line={d.collected} extra={d.collected.byIssued ? `${d.collected.byIssued} paid date not recorded` : undefined} notion={notion} />
            <Money label="Outstanding due" line={d.outstandingDue} notion={notion} />
            <Money label="Overdue" line={d.outstandingOverdue} notion={notion} />
            <p className="console-note tabular-nums" data-cash-counts="">
              {[
                d.drafts.length ? `Drafts ${d.drafts.length}` : null,
                d.voids.length ? `Voids ${d.voids.length}` : null,
                d.unrecognised.length ? `Status not recognised ${d.unrecognised.length}` : null,
                `Credits applied ${formatCents(d.creditsAppliedCents)}`,
              ].filter(Boolean).join("   ")}
            </p>
            <Listed label="No date" rows={d.collected.undated} notion={notion} />
            <Listed label="Amount missing" rows={missing} notion={notion} />
            <Listed label="Drafts" rows={d.drafts} notion={notion} />
            <Listed label="Voids" rows={d.voids} notion={notion} />
            <Listed label="Status not recognised" rows={d.unrecognised} notion={notion} />
            <p className="console-note" data-cash-footnote="">
              {CARD_PAYMENTS_FOOTNOTE}
            </p>
            {link}
          </div>
        );
      }}
    </InstrumentPanel>
  );
}
