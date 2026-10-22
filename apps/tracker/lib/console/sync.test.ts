import { describe, expect, it } from "vitest";
import { localHhmm } from "../time";
import { CHECKING, syncFromResponse, syncLabel, type SyncState } from "./sync";

// REQ-55 AC9: the sync line reports what the health route said, never a default "all fine".
const T1 = "2026-10-22T18:05:00.000Z";
const T2 = "2026-10-22T18:06:00.000Z";
const at = (iso: string) => localHhmm(new Date(iso));

describe("syncFromResponse", () => {
  it("starts at checking", () => {
    expect(CHECKING).toEqual({ kind: "checking", checkedAt: null, lastGoodAt: null });
    expect(syncLabel(CHECKING)).toBe("Checking sources");
  });

  it("a 200 ok is ok", () => {
    const s = syncFromResponse(200, { status: "ok", checkedAt: T1 }, CHECKING);
    expect(s).toEqual({ kind: "ok", checkedAt: T1, lastGoodAt: T1 });
    expect(syncLabel(s)).toBe(`Sources checked ${at(T1)}`);
  });

  it("a 200 with any other status (REQ-54 degraded, extra keys) is degraded", () => {
    const body = { status: "degraded", checkedAt: T1, providers: [{ id: "notion", status: "error" }] };
    const s = syncFromResponse(200, body, CHECKING);
    expect(s.kind).toBe("degraded");
    expect(syncLabel(s)).toBe(`Some sources failing, checked ${at(T1)}`);
  });

  it.each([
    ["a non-200", 503, { error: "unavailable" }],
    ["a 403", 403, { error: "forbidden" }],
    ["a network error", null, null],
    ["a body that does not parse", 200, { status: 3 }],
    ["a body with no checkedAt", 200, { status: "ok" }],
    ["a body that is not an object", 200, "ok"],
  ])("%s is unavailable", (_label, status, body) => {
    const s = syncFromResponse(status as number | null, body, CHECKING);
    expect(s).toEqual({ kind: "unavailable", checkedAt: null, lastGoodAt: null });
    expect(syncLabel(s)).toBe("Sync unavailable");
  });

  it("unavailable keeps the last good time", () => {
    const ok = syncFromResponse(200, { status: "ok", checkedAt: T1 }, CHECKING);
    const down = syncFromResponse(503, {}, ok);
    expect(down).toEqual({ kind: "unavailable", checkedAt: null, lastGoodAt: T1 });
    expect(syncLabel(down)).toBe(`Sync unavailable, last good ${at(T1)}`);
    const back = syncFromResponse(200, { status: "ok", checkedAt: T2 }, down);
    expect(back.lastGoodAt).toBe(T2);
  });

  it("no label claims the sources are online", () => {
    const states: SyncState[] = [
      CHECKING,
      syncFromResponse(200, { status: "ok", checkedAt: T1 }, CHECKING),
      syncFromResponse(200, { status: "degraded", checkedAt: T1 }, CHECKING),
      syncFromResponse(null, null, CHECKING),
      syncFromResponse(null, null, syncFromResponse(200, { status: "ok", checkedAt: T1 }, CHECKING)),
    ];
    for (const s of states) expect(syncLabel(s)).not.toMatch(/online/i);
  });
});
