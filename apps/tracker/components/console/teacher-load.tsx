import { formatReadout } from "../../lib/console/format";
import type { TeacherLoadData, TeacherLoadRowView } from "../../lib/console/operations";
import type { PanelView } from "../../lib/console/panel-view";
import type { WeekLoad } from "../../lib/domain/schedule/operations";
import { InstrumentPanel, type PanelFrame } from "./kit/instrument-panel";

const hours = (minutes: number) => formatReadout(minutes / 60, { unit: "h" });

/** "X of Y h (P%)", "0 h available", "availability not entered" or "availability unavailable"; never 0% for unknown (AC2, AC5). */
function Availability({ week, row, conflictsHref, current }: { week: WeekLoad; row: TeacherLoadRowView; conflictsHref: string; current: boolean }) {
  let text;
  if (week.availability === "unknown") text = <span data-availability="unknown">availability unavailable</span>;
  else if (week.availability === "not_entered") {
    text = (
      <span data-availability="not_entered">
        availability not entered
        {current && (
          <>
            {" "}
            <a href={row.availabilityHref}>Enter</a>
          </>
        )}
      </span>
    );
  } else if (!week.availableMinutes) text = <span data-availability="zero">0 h available</span>;
  else {
    const percent = Math.round((week.utilisation ?? 0) * 100);
    text = <span data-availability="entered">{`${formatReadout((week.insideMinutes ?? 0) / 60, {})} of ${hours(week.availableMinutes)} (${percent}%)`}</span>;
  }
  return (
    <>
      <span className="console-load-line">{text}</span>
      {week.outsideMinutes ? (
        <span className="console-load-line">
          {`${hours(week.outsideMinutes)} outside availability `}
          <a href={conflictsHref}>Conflicts</a>
        </span>
      ) : null}
    </>
  );
}

/**
 * Teacher load (REQ-58): per teacher, scheduled and delivered minutes for this Toronto week and
 * scheduled for the next, against entered availability. Delivered is shown for this week only and
 * never as 0 when it is unknown. Conflicts link to the scheduler page, never duplicated here.
 */
export function TeacherLoad({ result, ...frame }: PanelFrame & { result: PanelView<TeacherLoadData> }) {
  return (
    <InstrumentPanel {...frame} result={result}>
      {(d) => (
        <table data-panel-value="" className="console-load tabular-nums">
          <caption className="console-note">{`This week ${d.weeks[0].label}. Next week ${d.weeks[1].label}.`}</caption>
          <thead>
            <tr>
              <th scope="col">Teacher</th>
              <th scope="col">This week</th>
              <th scope="col">Next week</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => {
              const [now, next] = r.weeks;
              return (
                <tr key={r.staffId} data-teacher={r.staffId}>
                  <th scope="row">
                    {r.name}
                    {r.notTeaching && <span className="console-load-flag">Not active teaching staff</span>}
                  </th>
                  <td>
                    <span className="console-load-line">
                      {`${hours(now.scheduledMinutes)} scheduled, ${now.deliveredMinutes === null ? "delivered unavailable" : `${hours(now.deliveredMinutes)} delivered`}`}
                    </span>
                    <Availability week={now} row={r} conflictsHref={d.conflictsHref} current />
                  </td>
                  <td>
                    <span className="console-load-line">{`${hours(next.scheduledMinutes)} scheduled`}</span>
                    <Availability week={next} row={r} conflictsHref={d.conflictsHref} current={false} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </InstrumentPanel>
  );
}
