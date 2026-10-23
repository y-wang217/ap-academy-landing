import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TUNING } from "../domain/tuning";
import { nextDelay, startSyncPoller, type Visibility } from "./sync-poller";
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

function setup(hidden = false, fetchHealth: () => Promise<{ status: number; body: unknown }> = vi.fn(async () => OK)) {
  const visibility = fakeVisibility(hidden);
  const states: SyncState[] = [];
  const onHidden = vi.fn();
  const stop = startSyncPoller({ fetchHealth, visibility, onState: (s) => states.push(s), onHidden });
  return { fetchHealth, visibility, states, onHidden, stop };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startSyncPoller", () => {
  it("polls every 60 s, backing off to 10 minutes (REQ-62 AC6)", () => {
    expect(TUNING.consoleSignalsPollMs).toBe(60_000);
    expect(TUNING.consolePollMaxBackoffMs).toBe(600_000);
    expect([0, 1, 2, 3, 4, 5].map(nextDelay)).toEqual([60_000, 120_000, 240_000, 480_000, 600_000, 600_000]);
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

  // REQ-62 AC6: after a network error or a non-200 the wait doubles up to 10 minutes; a 200 resets it.
  it("backs off 120, 240, 480 then 600 s after failures and resets after a 200", async () => {
    const DOWN = { status: 503, body: { error: "console_unavailable" } };
    let answer: { status: number; body: unknown } = DOWN;
    const fetchHealth = vi.fn(async () => answer);
    const { stop } = setup(false, fetchHealth);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    const callsAfter = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms - 1);
      const before = fetchHealth.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1);
      return [before, fetchHealth.mock.calls.length];
    };
    expect(await callsAfter(120_000)).toEqual([1, 2]);
    expect(await callsAfter(240_000)).toEqual([2, 3]);
    expect(await callsAfter(480_000)).toEqual([3, 4]);
    expect(await callsAfter(600_000)).toEqual([4, 5]);
    answer = OK;
    expect(await callsAfter(600_000)).toEqual([5, 6]);
    expect(await callsAfter(60_000)).toEqual([6, 7]);
    stop();
  });

  it("a rejected fetch backs off too", async () => {
    const fetchHealth = vi.fn(async () => Promise.reject(new Error("offline network")));
    const { stop } = setup(false, fetchHealth);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchHealth).toHaveBeenCalledTimes(2);
    stop();
  });

  it("a degraded 200 is not an error: still every 60 s", async () => {
    const fetchHealth = vi.fn(async () => ({ status: 200, body: { status: "degraded", checkedAt: "2026-10-22T18:05:00.000Z" } }));
    const { states, stop } = setup(false, fetchHealth);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchHealth).toHaveBeenCalledTimes(4);
    expect(states.at(-1)?.kind).toBe("degraded");
    stop();
  });

  it("a tab shown again while a poll is pending polls once that poll settles", async () => {
    let release: (v: typeof OK) => void = () => {};
    const fetchHealth = vi.fn(() => new Promise<typeof OK>((r) => (release = r)));
    const { visibility, stop } = setup(false, fetchHealth);
    await vi.advanceTimersByTimeAsync(0);
    visibility.set(true);
    visibility.set(false);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    release(OK);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(2);
    stop();
  });
});
