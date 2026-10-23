import { TUNING } from "../domain/tuning";
import { CHECKING, syncFromResponse, type SyncState } from "./sync";

export type Visibility = { hidden: boolean; subscribe(cb: () => void): () => void };

type Timers = { setTimeout?: (fn: () => void, ms: number) => unknown; clearTimeout?: (id: unknown) => void };

/** The wait before the next poll: the interval, doubled per failure in a row, capped (REQ-62 AC6). */
export function nextDelay(failures: number): number {
  return Math.min(TUNING.consoleSignalsPollMs * 2 ** failures, TUNING.consolePollMaxBackoffMs);
}

/**
 * Pure poller behind the sync provider, so the timing is tested in node with
 * fake timers (ADR 0066). Fetches once when visible, then every
 * TUNING.consoleSignalsPollMs; after a network error or a non-200 the wait
 * doubles up to TUNING.consolePollMaxBackoffMs and goes back on the next 200
 * (REQ-62). A 200 that says degraded is not an error. Sends nothing while
 * hidden; polls at once and restarts the clock when the tab shows again. One
 * request at a time: the next poll is set only when the last one settles.
 * Returns stop().
 */
export function startSyncPoller(
  input: {
    fetchHealth: () => Promise<{ status: number; body: unknown }>;
    visibility: Visibility;
    onState: (state: SyncState) => void;
    onHidden: (hidden: boolean) => void;
  } & Timers,
): () => void {
  const set = input.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clear = input.clearTimeout ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let state = CHECKING;
  let timer: unknown = null;
  let pending = false;
  let stopped = false;
  let failures = 0;
  // Bumped by every restart, so a poll that settles after a restart knows it missed one.
  let generation = 0;
  let hidden = input.visibility.hidden;

  const halt = () => {
    if (timer !== null) clear(timer);
    timer = null;
  };
  const poll = async (gen: number) => {
    if (pending || stopped) return;
    pending = true;
    try {
      const res = await input.fetchHealth();
      state = syncFromResponse(res.status, res.body, state);
      failures = res.status === 200 ? 0 : failures + 1;
    } catch {
      state = syncFromResponse(null, null, state);
      failures += 1;
    } finally {
      pending = false;
    }
    if (stopped) return;
    input.onState(state);
    if (hidden || timer !== null) return;
    // A restart that came while this poll was pending polls at once; otherwise wait the interval.
    const current = generation;
    timer = set(() => {
      timer = null;
      void poll(current);
    }, gen === current ? nextDelay(failures) : 0);
  };
  const run = () => {
    halt();
    generation += 1;
    void poll(generation);
  };

  if (hidden) input.onHidden(true);
  else run();
  const unsubscribe = input.visibility.subscribe(() => {
    const now = input.visibility.hidden;
    if (now === hidden) return;
    hidden = now;
    input.onHidden(now);
    if (now) {
      generation += 1;
      halt();
    } else run();
  });

  return () => {
    stopped = true;
    halt();
    unsubscribe();
  };
}
