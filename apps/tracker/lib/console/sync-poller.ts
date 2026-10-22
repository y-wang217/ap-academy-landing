import { CHECKING, syncFromResponse, type SyncState } from "./sync";

/** One health poll a minute while the tab is visible (REQ-55 AC9). */
export const SYNC_INTERVAL_MS = 60_000;

export type Visibility = { hidden: boolean; subscribe(cb: () => void): () => void };

type Timers = { setInterval?: (fn: () => void, ms: number) => unknown; clearInterval?: (id: unknown) => void };

/**
 * Pure poller behind the sync provider, so the timing is tested in node with
 * fake timers (ADR 0066). Fetches once when visible, then every 60 s; sends
 * nothing while hidden; polls at once and restarts the interval when the tab
 * shows again. One request at a time: a tick during a pending fetch is skipped.
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
  const set = input.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clear = input.clearInterval ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));
  let state = CHECKING;
  let timer: unknown = null;
  let pending = false;
  let stopped = false;
  let hidden = input.visibility.hidden;

  const poll = async () => {
    if (pending || stopped) return;
    pending = true;
    try {
      const res = await input.fetchHealth();
      state = syncFromResponse(res.status, res.body, state);
    } catch {
      state = syncFromResponse(null, null, state);
    } finally {
      pending = false;
    }
    if (!stopped) input.onState(state);
  };
  const halt = () => {
    if (timer !== null) clear(timer);
    timer = null;
  };
  const run = () => {
    halt();
    void poll();
    timer = set(() => void poll(), SYNC_INTERVAL_MS);
  };

  if (hidden) input.onHidden(true);
  else run();
  const unsubscribe = input.visibility.subscribe(() => {
    const now = input.visibility.hidden;
    if (now === hidden) return;
    hidden = now;
    input.onHidden(now);
    if (now) halt();
    else run();
  });

  return () => {
    stopped = true;
    halt();
    unsubscribe();
  };
}
