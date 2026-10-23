"use client";

import { hhmm } from "../../../lib/console/format";
import { KIND_LABELS } from "../../../lib/console/signals";
import { useSignals } from "./signals-provider";

/**
 * The deferred strip (REQ-62 AC1, AC2): snoozed signals and those held during
 * protected time, always present, each with Show now. Nothing is lost while
 * the founder is teaching.
 */
export function DeferredStrip() {
  const { deferred, showNow } = useSignals();
  return (
    <details className="console-deferred" data-deferred="">
      <summary>{`${deferred.length} deferred`}</summary>
      {deferred.length === 0 ? (
        <p className="console-note">Nothing deferred</p>
      ) : (
        <ul>
          {deferred.map((s) => (
            <li key={s.signalKey} data-deferred-signal={s.signalKey}>
              <span className="console-row-title">{s.title}</span>
              <span className="console-row-reason">{`${KIND_LABELS[s.kind]}, ${s.until ? `snoozed until ${hhmm(s.until)}` : "held during protected time"}`}</span>
              <button type="button" onClick={() => showNow(s.signalKey)}>Show now</button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
