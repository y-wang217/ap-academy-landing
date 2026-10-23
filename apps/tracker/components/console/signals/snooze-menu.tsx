"use client";

import { hhmm } from "../../../lib/console/format";
import { useSignals } from "./signals-provider";

/** Snooze choices for one signal: a details menu of buttons. Only the console's display changes. */
export function SnoozeMenu({ signalKey, title }: { signalKey: string; title: string }) {
  const { snoozeOptions, snooze } = useSignals();
  return (
    <details className="console-snooze" data-snooze="">
      <summary aria-label={`Snooze ${title}`}>Snooze</summary>
      <ul>
        {snoozeOptions.map((o) => (
          <li key={o.label}>
            <button type="button" onClick={() => snooze(signalKey, o.until)}>{`${o.label} (until ${hhmm(o.until)})`}</button>
          </li>
        ))}
      </ul>
    </details>
  );
}
