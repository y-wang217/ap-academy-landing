"use client";

import type { ReactNode } from "react";
import { MODE_LABELS, type ConsoleMode } from "../../../lib/console/modes";
import { syncLabel } from "../../../lib/console/sync";
import { useMode } from "./mode-context";
import { ShortcutHelp } from "./shortcut-help";
import { syncTone } from "./sync-line";
import { useSync } from "./sync-provider";

function Indicator({ name, label, tone, children }: { name: string; label: string; tone: string; children: ReactNode }) {
  return (
    <li data-indicator={name} className="console-indicator">
      <span className="console-dot" data-tone={tone} aria-hidden="true" />
      <span className="console-indicator-label">{label}</span>
      <span data-indicator-value="">{children}</span>
    </li>
  );
}

/**
 * The bottom rail (REQ-55 AC9): five indicators, each from real state, the
 * keyboard help and CSS trim. Nothing here looks like a button that is not one.
 * Access is known because the page rendered past the owner gate. Motion's two
 * labels are both rendered; the reduced-motion media query shows one.
 */
export function PhysicalRail({ connectedByMode }: { connectedByMode: Record<ConsoleMode, { connected: number; total: number }> }) {
  const { mode } = useMode();
  const sync = useSync();
  const panels = connectedByMode[mode];
  return (
    <footer data-rail="" className="console-rail">
      <ul className="console-indicators" aria-label="Console status">
        <Indicator name="sources" label="Sources" tone={syncTone(sync)}>
          {syncLabel(sync)}
        </Indicator>
        <Indicator name="access" label="Access" tone="ok">
          Owner verified
        </Indicator>
        <Indicator name="panels" label="Panels" tone={panels.connected === panels.total ? "ok" : "muted"}>
          {`${panels.connected} of ${panels.total} connected`}
        </Indicator>
        <Indicator name="motion" label="Motion" tone="muted">
          <span className="console-motion-on">Motion on</span>
          <span className="console-motion-reduced">Reduced motion</span>
        </Indicator>
        <Indicator name="mode" label="Mode" tone="amber">
          {MODE_LABELS[mode]}
        </Indicator>
      </ul>
      <ShortcutHelp />
    </footer>
  );
}
