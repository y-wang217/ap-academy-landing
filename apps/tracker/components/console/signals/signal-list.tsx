"use client";

import { hhmm } from "../../../lib/console/format";
import { KIND_LABELS, SIGNAL_KINDS, signalsSlotView, type Signal } from "../../../lib/console/signals";
import { InstrumentPanel, type PanelFrame } from "../kit/instrument-panel";
import { useSignals } from "./signals-provider";
import { SnoozeMenu } from "./snooze-menu";

/** One exception: what, its source with a link, when it was checked, one next action, Dismiss and Snooze. */
function SignalRow({ s }: { s: Signal }) {
  const { dismiss } = useSignals();
  return (
    <li className="console-row console-signal" data-signal={s.signalKey} data-kind={s.kind}>
      <div className="console-row-text">
        <p className="console-row-title">{s.title}</p>
        <p className="console-row-reason">{s.detail}</p>
        <p className="console-row-reason">
          <a href={s.sourceUrl}>{s.sourceLabel}</a>
          {`, checked ${hhmm(s.checkedAt)}`}
        </p>
      </div>
      <span className="console-signal-actions">
        <a href={s.action.href}>{s.action.label}</a>
        <button type="button" onClick={() => dismiss(s.signalKey)} aria-label={`Dismiss ${s.title}`}>
          Dismiss
        </button>
        <SnoozeMenu signalKey={s.signalKey} title={s.title} />
      </span>
    </li>
  );
}

/**
 * The signals slot (REQ-62 AC3, AC4): exceptions grouped by kind. "No
 * exceptions found" only when every check is ok; otherwise "Some checks
 * failed", with the failed kinds named. Dismiss and Snooze change only this
 * display.
 */
export function SignalList(frame: PanelFrame) {
  const { state, exceptions, memoryOnly } = useSignals();
  const result = signalsSlotView(state.view, exceptions, state.failure);
  const allOk = result.staleReason === null;
  return (
    <InstrumentPanel {...frame} result={result}>
      {(rows) => (
        <div data-panel-value="" className="console-signal-list">
          {rows.length === 0 ? (
            <p className="console-note">{allOk ? frame.emptyText : "Some checks failed"}</p>
          ) : (
            SIGNAL_KINDS.filter((k) => rows.some((r) => r.kind === k)).map((kind) => {
              const group = rows.filter((r) => r.kind === kind);
              return (
                <section key={kind} data-signal-group={kind} aria-label={KIND_LABELS[kind]}>
                  <h3 className="console-signal-kind">{`${KIND_LABELS[kind]} (${group.length})`}</h3>
                  <ol className="console-rows">
                    {group.map((s) => (
                      <SignalRow key={s.signalKey} s={s} />
                    ))}
                  </ol>
                </section>
              );
            })
          )}
          {memoryOnly && <p className="console-note">Signal memory is this tab only</p>}
        </div>
      )}
    </InstrumentPanel>
  );
}
