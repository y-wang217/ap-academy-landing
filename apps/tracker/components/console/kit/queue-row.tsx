import type { PanelView } from "../../../lib/console/panel-view";
import { InstrumentPanel, type PanelFrame } from "./instrument-panel";

export type QueueItem = { id: string; title: string; reason: string; due?: string; href?: string };

/** One queue row: who, why, when, and a plain deep link to the record. The console never acts itself. */
export function QueueRow({ item, selected = false }: { item: QueueItem; selected?: boolean }) {
  return (
    <li className="console-row" data-selected={selected ? "" : undefined}>
      <div className="console-row-text">
        <p className="console-row-title">{item.title}</p>
        <p className="console-row-reason">{item.reason}</p>
      </div>
      {selected && <span className="console-next-tag">NEXT</span>}
      {item.due && <span className="console-row-due tabular-nums">{item.due}</span>}
      {item.href && (
        <a href={item.href} aria-label={`Open ${item.title}`}>
          Open
        </a>
      )}
    </li>
  );
}

/** A status-bearing list of rows; for a queue the first row is the selected one. */
export function QueueList({ result, selectFirst = true, ...frame }: PanelFrame & { result: PanelView<QueueItem[]>; selectFirst?: boolean }) {
  return (
    <InstrumentPanel {...frame} result={result}>
      {(items) =>
        items.length === 0 ? (
          <p className="console-note">{frame.emptyText}</p>
        ) : (
          <ol data-panel-value="" className="console-rows">
            {items.map((item, i) => (
              <QueueRow key={item.id} item={item} selected={selectFirst && i === 0} />
            ))}
          </ol>
        )
      }
    </InstrumentPanel>
  );
}
