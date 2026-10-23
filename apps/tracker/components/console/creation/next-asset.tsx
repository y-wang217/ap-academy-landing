import type { ReactNode } from "react";
import type { CreationView } from "../../../lib/console/creation";
import type { PanelView } from "../../../lib/console/panel-view";
import { InstrumentPanel, type PanelFrame } from "../kit/instrument-panel";
import { TaskFacts } from "./task-facts";

/**
 * Next asset (REQ-60 AC1, AC5, AC6): the selected task, or the next open
 * Marketing deliverable, with its facts and its Notion page. `interrupt` is the
 * fresh-lead banner slot (REQ-62); with none, nothing renders. It never changes
 * the task shown or any link.
 */
export function NextAsset({ result, interrupt, ...frame }: PanelFrame & { result: PanelView<CreationView>; interrupt?: ReactNode }) {
  return (
    <InstrumentPanel {...frame} result={result}>
      {(d) => {
        const task = d.selected ?? d.next;
        return (
          <div data-panel-value="" className="console-creation">
            {interrupt && (
              <div data-interrupt="" className="console-creation-interrupt">
                {interrupt}
              </div>
            )}
            {d.selectedMissing && <p className="console-note">The selected task is no longer open in Notion</p>}
            {task ? (
              <article data-task-id={task.id} className="console-creation-task">
                <p className="console-creation-head">
                  <span className="console-next-tag">{d.selected ? "Selected" : "Next"}</span>
                </p>
                <h3 className="console-creation-name">{task.name}</h3>
                <TaskFacts task={task} />
                <a href={task.pageUrl}>Open in Notion</a>
              </article>
            ) : (
              <p className="console-note">{frame.emptyText}</p>
            )}
          </div>
        );
      }}
    </InstrumentPanel>
  );
}
