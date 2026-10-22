import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYNC_INTERVAL_MS, startSyncPoller, type Visibility } from "./sync-poller";
import type { SyncState } from "./sync";

// REQ-55 AC9, AC6: one poll on start, one a minute while visible, none while hidden.
const OK = { status: 200, body: { status: "ok", checkedAt: "2026-10-22T18:05:00.000Z" } };

function fakeVisibility(hidden: boolean) {
  const listeners = new Set<() => void>();
  const v: Visibility & { set(h: boolean): void; listeners: Set<() => void> } = {
    hidden,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set(h) {
      v.hidden = h;
      for (const cb of listeners) cb();
    },
    listeners,
  };
  return v;
}

function setup(hidden = false, fetchHealth = vi.fn(async () => OK)) {
  const visibility = fakeVisibility(hidden);
  const states: SyncState[] = [];
  const onHidden = vi.fn();
  const stop = startSyncPoller({ fetchHealth, visibility, onState: (s) => states.push(s), onHidden });
  return { fetchHealth, visibility, states, onHidden, stop };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startSyncPoller", () => {
  it("polls every 60 s", () => {
    expect(SYNC_INTERVAL_MS).toBe(60_000);
  });

  it("fetches once on a visible start, then again at 60 s", async () => {
    const { fetchHealth, states, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.kind).toBe("ok");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchHealth).toHaveBeenCalledTimes(2);
    stop();
  });

  it("sends nothing on a hidden start", async () => {
    const { fetchHealth, stop } = setup(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchHealth).toHaveBeenCalledTimes(0);
    stop();
  });

  it("stops while hidden and polls right away when visible again", async () => {
    const { fetchHealth, visibility, onHidden, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    visibility.set(true);
    expect(onHidden).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    visibility.set(false);
    expect(onHidden).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchHealth).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchHealth).toHaveBeenCalledTimes(3);
    stop();
  });

  it("a rejected fetch is unavailable", async () => {
    const { states, stop } = setup(false, vi.fn(async () => Promise.reject(new Error("offline network"))));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)?.kind).toBe("unavailable");
    stop();
  });

  it("skips a tick while a fetch is still pending", async () => {
    const fetchHealth = vi.fn(() => new Promise<typeof OK>(() => {}));
    const { stop } = setup(false, fetchHealth);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stop() clears the interval and unsubscribes", async () => {
    const { fetchHealth, visibility, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(visibility.listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
  });
});
