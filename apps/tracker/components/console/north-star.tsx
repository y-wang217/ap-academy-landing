import type { ReactNode } from "react";
import { notionPageUrl } from "../../lib/console/contracts";
import { formatReadout } from "../../lib/console/format";
import { CANNOT_VERIFY, comparisonLine, dayLabel, signedHours, type NorthStarData } from "../../lib/console/north-star";
import type { PanelView } from "../../lib/console/panel-view";
import { normalId } from "../../lib/domain/billing";
import { InstrumentPanel, type PanelFrame } from "./kit/instrument-panel";

const REASONS: Record<string, string> = {
  not_synced: "not synced", unpaid: "unpaid", stage_not_active: "stage not active",
  trial: "trial", makeup: "make-up", extra: "extra", one_off: "one-off", adopted: "adopted", not_in_scheduler: "not in scheduler",
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const scheduleHref = (date: string, staffId: string) => `/tracker/schedule?date=${date}&staffId=${staffId}`;

function WeekLinks({ data }: { data: NorthStarData }) {
  return (
    <p className="console-note">
      <a href={data.links.previous}>Previous week</a>
      {data.links.next && (
        <>
          {" "}
          <a href={data.links.next}>Next week</a>
        </>
      )}
    </p>
  );
}

/** Every counted event and excluded series, each with its series and student links (AC5). Native details: keyboard operable. */
function Detail({ data }: { data: NorthStarData }) {
  const { counted, excluded, notInScheduler } = data.current;
  const student = (id: string) => (
    <a href={notionPageUrl(id)} target="_blank" rel="noopener noreferrer">
      {data.names[normalId(id)] ?? "Unknown student"}
    </a>
  );
  const series = (id: string, date: string, staffId: string) => <a href={scheduleHref(date, staffId)}>{`Series ${id.slice(0, 8)}`}</a>;
  return (
    <details className="console-north-detail">
      <summary>{`Show ${counted.length} counted, ${excluded.length} excluded`}</summary>
      <ul>
        {counted.map((c) => (
          <li key={`${c.seriesId}-${c.event}`} data-north-row="counted">
            {`${c.event === "addition" ? "+" : "-"}${c.minutes} min ${c.event} ${dayLabel(c.date)} `}
            {student(c.studentId)}{" "}
            <span>{c.class === "unverified" && c.reason ? `unverified: ${REASONS[c.reason]}` : c.class}</span>{" "}
            {series(c.seriesId, c.date, c.staffId)}
          </li>
        ))}
        {excluded.map((e) => (
          <li key={`${e.seriesId}-excluded`} data-north-row="excluded">
            {`excluded: ${REASONS[e.reason]} ${dayLabel(e.date)} `}
            {student(e.studentId)} {series(e.seriesId, e.date, e.staffId)}
          </li>
        ))}
      </ul>
      {notInScheduler.length > 0 && <p className="console-note">{`Not in scheduler: ${plural(notInScheduler.length, "student")}, not counted`}</p>}
    </details>
  );
}

/**
 * The north-star instrument (REQ-56, tracker ADR 0068): verified net-new weekly hours for one
 * Toronto week, its evidence and its honest failure states. Unverifiable shows the gross moves
 * unclassified and never a verified figure; a percentage appears only per AC6.
 */
export function NorthStar({ result, ...frame }: PanelFrame & { result: PanelView<NorthStarData> }) {
  const data = result.data;
  let idle: ReactNode = null;
  if (data && result.status === "unverifiable") {
    idle = (
      <div data-north-star="unverifiable">
        <p className="console-failure-title">{CANNOT_VERIFY}</p>
        <p className="console-note">{data.weekLabel}</p>
        <p className="console-note">{`Gross ${signedHours(data.current.grossAdditionsMinutes)}, ${signedHours(-data.current.grossReductionsMinutes)} (unclassified)`}</p>
        <p className="console-note">
          <a href={data.links.retry}>Retry</a>
        </p>
        <WeekLinks data={data} />
        <Detail data={data} />
      </div>
    );
  } else if (data && result.status === "empty") {
    idle = (
      <div data-north-star="empty">
        <p className="console-note">{data.weekLabel}</p>
        <WeekLinks data={data} />
      </div>
    );
  } else {
    idle = <span data-north-star={result.status} hidden />;
  }
  return (
    <InstrumentPanel {...frame} retryHref={data?.links.retry ?? frame.retryHref} result={result} idle={idle}>
      {(d) => {
        const c = d.current;
        const leads = d.diagnostics.leads;
        return (
          <div data-north-star={result.status}>
            <p className="console-metric">
              <span data-panel-value="" className="console-readout tabular-nums">
                {signedHours(c.netNewVerifiedMinutes ?? 0)}
              </span>
              <span className="console-note">{`net new verified hours, ${d.weekLabel}`}</span>
            </p>
            <p className="console-note tabular-nums">
              {`Opening ${formatReadout((c.openingVerifiedMinutes ?? 0) / 60, { unit: "h" })} | ${signedHours(c.additionsVerifiedMinutes ?? 0)} added | ${signedHours(-(c.reductionsVerifiedMinutes ?? 0))} reduced`}
            </p>
            <p className="console-note tabular-nums">{`Unverified net ${signedHours(c.netNewUnverifiedMinutes ?? 0)} (not counted)`}</p>
            {d.comparison && <p className="console-delta tabular-nums">{comparisonLine(d.comparison)}</p>}
            <p className="console-note tabular-nums">
              {leads
                ? `Leads awaiting first contact ${leads.awaitingFirstContact} | Overdue follow-ups ${leads.overdueFollowUps}`
                : "Leads awaiting first contact: Leads unavailable | Overdue follow-ups: Leads unavailable"}
              {` | Booked ${formatReadout(d.diagnostics.bookedMinutes / 60, { unit: "h" })} (unclassified)`}
            </p>
            <WeekLinks data={d} />
            <Detail data={d} />
          </div>
        );
      }}
    </InstrumentPanel>
  );
}
