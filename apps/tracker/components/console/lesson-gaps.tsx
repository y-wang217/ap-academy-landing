import type { LessonGapsData } from "../../lib/console/operations";
import type { PanelView } from "../../lib/console/panel-view";
import { InstrumentPanel, type PanelFrame } from "./kit/instrument-panel";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Lesson log gaps (REQ-58): ended classes with no outcome row, each with its occurrence key, the
 * next action and a deep link to where the owner logs or links it. No-shows are a separate list and
 * never counted as gaps. The console only links; logging stays on the scheduler pages.
 */
export function LessonGaps({ result, ...frame }: PanelFrame & { result: PanelView<LessonGapsData> }) {
  return (
    <InstrumentPanel {...frame} result={result}>
      {(d) => (
        <div data-panel-value="" className="console-gaps">
          <p className="console-note">
            {`${d.window.label}. `}
            <a href={d.toggle.href}>{d.toggle.label}</a>
          </p>
          {d.gaps.length === 0 ? (
            <p className="console-note">{frame.emptyText}</p>
          ) : (
            <ol className="console-rows" data-gaps="">
              {d.gaps.map((g) => (
                <li key={g.id} className="console-row" data-gap={g.key} data-action={g.action}>
                  <div className="console-row-text">
                    <p className="console-row-title">{g.title}</p>
                    <p className="console-row-reason">
                      {`${g.reason} `}
                      <code>{g.key}</code>
                    </p>
                  </div>
                  <span className="console-row-due tabular-nums">{g.ended}</span>
                  <a href={g.href} aria-label={`${g.reason}: ${g.title}`}>
                    {g.action === "log" ? "Log" : "Open"}
                  </a>
                </li>
              ))}
              {d.moreGaps > 0 && (
                <li className="console-row">
                  <a href={d.unlinkedHref}>{`${d.moreGaps} more`}</a>
                </li>
              )}
            </ol>
          )}
          {d.pendingLogs > 0 && <p className="console-note">{`${plural(d.pendingLogs, "log")} in progress`}</p>}
          {d.noShows.length > 0 && (
            <section aria-label="No-shows" data-no-shows="">
              <h3 className="console-subhead">{`No-shows (${d.noShows.length + d.moreNoShows})`}</h3>
              <ol className="console-rows">
                {d.noShows.map((n) => (
                  <li key={n.id} className="console-row" data-no-show={n.key}>
                    <div className="console-row-text">
                      <p className="console-row-title">{n.title}</p>
                      <p className="console-row-reason">
                        <code>{n.key}</code>
                      </p>
                    </div>
                    <span className="console-row-due tabular-nums">{n.ended}</span>
                    <a href={n.href} aria-label={`Open ${n.title}`}>
                      Open
                    </a>
                  </li>
                ))}
                {d.moreNoShows > 0 && (
                  <li className="console-row">
                    <a href={d.unlinkedHref}>{`${d.moreNoShows} more`}</a>
                  </li>
                )}
              </ol>
            </section>
          )}
        </div>
      )}
    </InstrumentPanel>
  );
}
