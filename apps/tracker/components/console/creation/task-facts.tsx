import type { CreationTask } from "../../../lib/console/creation";
import { dayMonth } from "../../../lib/console/format";

/**
 * A Work row's facts as Notion holds them (REQ-60 AC1): every missing value is
 * labelled, never filled in. Task Types and the parent project link to their pages.
 */
export function TaskFacts({ task }: { task: CreationTask }) {
  return (
    <dl className="console-creation-facts">
      <dt>State</dt>
      <dd>{task.state ?? "State not set"}</dd>
      <dt>Type</dt>
      <dd>{task.type ?? "Type not set"}</dd>
      <dt>Due / Review</dt>
      <dd>
        {task.due ? <span className="tabular-nums">{dayMonth(task.due)}</span> : "Due not set"}
        {task.overdue && <span className="console-creation-flag"> Overdue</span>}
      </dd>
      <dt>Owner</dt>
      <dd>{task.owner ?? "Owner not set"}</dd>
      <dt>Task type</dt>
      <dd>
        {task.taskTypes.length === 0
          ? "Task type not set"
          : task.taskTypes.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ", "}
                <a href={t.pageUrl}>{t.name ?? "Name unavailable"}</a>
              </span>
            ))}
      </dd>
      <dt>Parent project</dt>
      <dd>{task.parent ? <a href={task.parent.pageUrl}>{task.parent.name ?? "Parent project"}</a> : "No parent project"}</dd>
      <dt>Expected result</dt>
      <dd>{task.expectedResult ?? "No expected result"}</dd>
    </dl>
  );
}
