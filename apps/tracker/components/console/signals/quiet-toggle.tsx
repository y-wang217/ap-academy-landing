"use client";

import { hhmm } from "../../../lib/console/format";
import { useOptionalSignals } from "./signals-provider";

/**
 * Quiet mode in the header (REQ-62 AC2): a session-scoped toggle, and what
 * protected time is now. Teaching time comes from the owner's own classes;
 * when it cannot be read the header says why, never "free".
 */
export function QuietToggle() {
  const signals = useOptionalSignals();
  if (!signals) return null;
  const { state, now, setQuiet } = signals;
  const p = state.view.protectedTime;
  const teaching = p.state === "teaching" && Date.parse(p.until) > Date.parse(now);
  let note: string | null = null;
  if (teaching) note = `Teaching until ${hhmm(p.until)}`;
  else if (state.quiet) note = "Quiet";
  else if (p.state === "unknown") note = `Teaching time unknown: ${p.reason}`;
  return (
    <div className="console-quiet" data-quiet="">
      <button type="button" aria-pressed={state.quiet} onClick={() => setQuiet(!state.quiet)}>
        Quiet
      </button>
      {note && <span data-protected-note="">{note}</span>}
    </div>
  );
}
