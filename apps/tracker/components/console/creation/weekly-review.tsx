import { notionPageUrl } from "../../../lib/console/contracts";
import { WEEKLY_MEDIA_REVIEW_PAGE_ID, type CreationView } from "../../../lib/console/creation";
import type { PanelView } from "../../../lib/console/panel-view";
import { InstrumentPanel, type PanelFrame } from "../kit/instrument-panel";
import { TaskFacts } from "./task-facts";

function NoneFound({ workDatabaseUrl }: { workDatabaseUrl: string }) {
  return (
    <p className="console-note" data-weekly-none="">
      {"If it is marked Done or was moved, it is not shown. "}
      <a href={notionPageUrl(WEEKLY_MEDIA_REVIEW_PAGE_ID)}>Open the pinned review</a>
      {" "}
      <a href={workDatabaseUrl}>Create one in Notion</a>
    </p>
  );
}

/**
 * Weekly media review (REQ-60 AC3): the Work row pinned by page id, when it is
 * open, in Marketing and Recurring. Otherwise it says none was found and why,
 * and links to the pinned page and the Work database. The console never
 * creates the row.
 */
export function WeeklyReview({ result, ...frame }: PanelFrame & { result: PanelView<CreationView> }) {
  const workUrl = frame.canonical?.href ?? notionPageUrl(WEEKLY_MEDIA_REVIEW_PAGE_ID);
  return (
    <InstrumentPanel {...frame} result={result} idle={result.status === "empty" ? <NoneFound workDatabaseUrl={workUrl} /> : undefined}>
      {(d) => (
        <div data-panel-value="" className="console-creation">
          {d.weeklyReview ? (
            <article data-task-id={d.weeklyReview.id} className="console-creation-task">
              <h3 className="console-creation-name">{d.weeklyReview.name}</h3>
              <TaskFacts task={d.weeklyReview} />
              <a href={d.weeklyReview.pageUrl}>Open in Notion</a>
            </article>
          ) : (
            <>
              <p className="console-note">{frame.emptyText}</p>
              <NoneFound workDatabaseUrl={d.workDatabaseUrl} />
            </>
          )}
        </div>
      )}
    </InstrumentPanel>
  );
}
