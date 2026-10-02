"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards.
 *
 * The trainer picks random words and reads localStorage, so its real content
 * can't be rendered on the server without a hydration mismatch. Gating on this
 * lets the random state live in a lazy `useState` initializer — no setState in
 * an effect, and the first client render still matches the server's markup.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
