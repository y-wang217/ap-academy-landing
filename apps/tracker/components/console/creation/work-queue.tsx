import type { CreationEntry, CreationTask, CreationView } from "../../../lib/console/creation";
import { dayMonth } from "../../../lib/console/format";
import type { PanelView } from "../../../lib/console/panel-view";
import { InstrumentPanel, type PanelFrame } from "../kit/instrument-panel";

function Row({ task, selectedId, nested }: { task: CreationTask; selectedId: string | null; nested: boolean }) {
  const selected = selectedId === task.id;
  const facts = [
    task.state ?? "State not set",
    task.type ?? "Type not set",
    task.owner ?? "Owner not set",
    task.taskTypes.length ? task.taskTypes.map((t) => t.name ?? "Name unavailable").join(", ") : "Task type not set",
  ].join(", ");
  return (
    <div className="console-row" data-selected={selected ? "" : undefined}>
      <div className="console-row-text">
        <p className="console-row-title">{task.name}</p>
        <p className="console-row-reason console-creation-reason">
          {facts}
          {task.isWeeklyReview && <span className="console-creation-label"> Weekly review</span>}
          {!nested && task.parent && (
            <>
              {" "}
              <a href={task.parent.pageUrl}>{task.parent.name ? `Parent project: ${task.parent.name}` : "Parent project"}</a>
            </>
          )}
        </p>
      </div>
      <span className="console-row-due tabular-nums">
        {task.due ? dayMonth(task.due) : "Due not set"}
        {task.overdue && <span className="console-creation-flag"> Overdue</span>}
      </span>
      <a href={task.selectHref} aria-label={`Select ${task.name}`}>
        Select
      </a>
      <a href={task.pageUrl} aria-label={`Open ${task.name} in Notion`}>
        Open
      </a>
    </div>
  );
}

function Item({ entry, selectedId }: { entry: CreationEntry | CreationTask; selectedId: string | null }) {
  const children = "children" in entry ? entry.children : [];
  return (
    <li data-task={entry.id} aria-current={selectedId === entry.id ? "true" : undefined} className="console-creation-item">
      <Row task={entry} selectedId={selectedId} nested={false} />
      {children.length > 0 && (
        <ol className="console-rows console-creation-children" aria-label={`Tasks in ${entry.name}`}>
          {children.map((c) => (
            <li key={c.id} data-task={c.id} aria-current={selectedId === c.id ? "true" : undefined} className="console-creation-item">
              <Row task={c} selectedId={selectedId} nested />
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * Work queue (REQ-60 AC2, AC6): every open Marketing row in State order, with a
 * project's children nested under it. Select keeps the mode and other query
 * parameters and fills the next asset panel; Open goes to the Notion page.
 */
export function WorkQueue({ result, ...frame }: PanelFrame & { result: PanelView<CreationView> }) {
  return (
    <InstrumentPanel {...frame} result={result}>
      {(d) => (
        <div data-panel-value="" className="console-creation">
          {d.queue.length === 0 ? (
            <p className="console-note">{frame.emptyText}</p>
          ) : (
            <ol className="console-rows console-creation-queue">
              {d.queue.map((e) => (
                <Item key={e.id} entry={e} selectedId={d.selected?.id ?? null} />
              ))}
            </ol>
          )}
        </div>
      )}
    </InstrumentPanel>
  );
}
