"use client";

import { useSyncExternalStore } from "react";

const KEY = "tracker.chart-hint";
const listeners = new Set<() => void>();

// Dismissal lives in this device's storage, which may be missing or blocked,
// so every access is guarded and the page works without it.
function dismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "dismissed";
  } catch {
    return false;
  }
}
function dismiss() {
  try {
    window.localStorage.setItem(KEY, "dismissed");
  } catch {
    // Nothing to remember it with. The hint simply shows again next time.
  }
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** One-time hint above the course charts. Hidden on the server, shown after hydration unless dismissed here before. */
export function ChartHint() {
  const hidden = useSyncExternalStore(subscribe, dismissed, () => true);
  if (hidden) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
      <span>Tap a point to see the marks behind it.</span>
      <button type="button" onClick={dismiss} className="shrink-0 font-medium text-accent">
        Got it
      </button>
    </div>
  );
}
