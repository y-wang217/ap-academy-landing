"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { CONSOLE_MODES, MODE_LABELS, tabKeyTarget, type ConsoleMode } from "../../../lib/console/modes";
import { useMode } from "./mode-context";

/**
 * The Sales / Creation / Operations tablist (REQ-55 AC2): roving tabIndex,
 * arrows with wrap, Home and End move and select; Enter and Space select
 * through the button's own click.
 */
export function ModeTabs() {
  const { mode, select } = useMode();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = tabKeyTarget(e.key, index, CONSOLE_MODES.length);
    if (target === null) return;
    e.preventDefault();
    select(CONSOLE_MODES[target]);
    tabs.current[target]?.focus();
  };
  return (
    <div role="tablist" aria-label="Console mode" className="console-tabs">
      {CONSOLE_MODES.map((m, i) => (
        <button
          key={m}
          ref={(el) => {
            tabs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`console-tab-${m}`}
          aria-selected={m === mode}
          aria-controls={`console-panel-${m}`}
          tabIndex={m === mode ? 0 : -1}
          onClick={() => select(m)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className="console-tab"
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

/** One mode's panel grid. Server-rendered panels come in as children; only the selected mode is shown. */
export function ModePanel({ mode, children }: { mode: ConsoleMode; children: ReactNode }) {
  const { mode: selected } = useMode();
  return (
    <div role="tabpanel" id={`console-panel-${mode}`} aria-labelledby={`console-tab-${mode}`} data-mode-panel={mode} hidden={selected !== mode} className={`console-grid console-grid-${mode}`}>
      {children}
    </div>
  );
}
