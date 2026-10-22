"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CONSOLE_MODES, type ConsoleMode } from "../../../lib/console/modes";

type ModeState = { mode: ConsoleMode; select: (mode: ConsoleMode) => void };
const ModeContext = createContext<ModeState | null>(null);

const inField = (target: EventTarget | null) => target instanceof Element && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;

/**
 * The selected console mode (REQ-55 AC2). Selecting writes ?mode= with
 * replaceState, so a reload or a link opens the same mode. Only the founder
 * switches it: by a tab, or by 1, 2, 3; ? opens the shortcuts list. The keys
 * are ignored with Ctrl, Meta or Alt and inside form fields.
 */
export function ModeProvider({ initial, children }: { initial: ConsoleMode; children: ReactNode }) {
  const [mode, setMode] = useState(initial);
  const select = useCallback((next: ConsoleMode) => {
    setMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || inField(e.target)) return;
      const index = ["1", "2", "3"].indexOf(e.key);
      if (index >= 0) {
        select(CONSOLE_MODES[index]);
      } else if (e.key === "?") {
        const help = document.querySelector<HTMLDetailsElement>("details[data-shortcuts]");
        if (help) help.open = true;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [select]);

  const value = useMemo(() => ({ mode, select }), [mode, select]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeState {
  const state = useContext(ModeContext);
  if (!state) throw new Error("useMode outside ModeProvider");
  return state;
}
