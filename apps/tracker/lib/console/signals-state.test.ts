import { describe, expect, it } from "vitest";
import type { Signal, SignalsView } from "./signals";
import {
  bandOf, deferredOf, exceptionsOf, healthOf, initialSignalsState, isProtected, memoryKey, readMemory, signalsReducer, snoozeOptions, toAnnounce, writeMemory,
  type SignalsState, type StorageLike,
} from "./signals-state";

// REQ-62 T1, AC1, AC2, AC4: the browser-held signal state.
const T0 = Date.parse("2026-10-22T18:00:00.000Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

const fresh = (n: number, createdMin: number): Signal => ({
  signalKey: `fresh_lead:lead${n}`, kind: "fresh_lead", title: `Lead ${n}`, detail: "Meta form", sourceLabel: "Students & Parents", sourceUrl: `https://www.notion.so/lead${n}`,
  checkedAt: at(0), createdAt: at(createdMin), action: { label: "Call now", href: `?mode=sales&lead=lead${n}` },
});
const overdue: Signal = { ...fresh(9, 0), signalKey: "followup_overdue:lead9", kind: "followup_overdue", createdAt: null };
const viewOf = (signals: Signal[], protectedTime: SignalsView["protectedTime"] = { state: "free" }): SignalsView => ({
  checkedAt: at(0), signals, checks: [], protectedTime,
  health: [{ key: "notionLeads", label: "Notion leads", status: "ready", lastCheckedAt: at(0), lastSuccessfulFetchAt: at(0), staleReason: null, errorMessage: null }],
});
const EMPTY = { local: { watermark: null, acked: {}, announced: [], snoozed: {} }, session: { quiet: false, dismissed: {} }, memoryOnly: false };
const start = (signals: Signal[], now = at(0), memory = EMPTY) => initialSignalsState(viewOf(signals), memory, now);
const band = (s: SignalsState, now = at(0)) => bandOf(s, now).map((x) => x.signalKey);
const poll = (s: SignalsState, signals: Signal[], now: string, protectedTime?: SignalsView["protectedTime"]) =>
  signalsReducer(s, { type: "refreshOk", view: viewOf(signals, protectedTime), now });

function fakeStorage() {
  const map = new Map<string, string>();
  const store: StorageLike = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
  return { store, map };
}
const throwing: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };

describe("polls (T1, AC1)", () => {
  it("a first visit shows leads from the last 72 h and announces none of them", () => {
    const s = start([fresh(1, -60), fresh(2, -73 * 60)]);
    expect(band(s)).toEqual(["fresh_lead:lead1"]);
    expect(toAnnounce(s, at(0))).toEqual([]);
  });

  it("one key per lead across repeated and out-of-order polls; a new lead is announced once", () => {
    let s = start([fresh(1, -60)]);
    s = poll(s, [fresh(2, 1), fresh(1, -60)], at(2));
    expect(band(s, at(2))).toEqual(["fresh_lead:lead1", "fresh_lead:lead2"]);
    expect(s.pulsing).toEqual(["fresh_lead:lead2"]);
    s = poll(s, [fresh(1, -60), fresh(2, 1)], at(3));
    expect(band(s, at(3))).toEqual(["fresh_lead:lead1", "fresh_lead:lead2"]);
    expect(s.pulsing).toEqual([]);
  });

  it("an offline poll keeps the last view and marks health red with the failure", () => {
    let s = start([fresh(1, -60)]);
    s = signalsReducer(s, { type: "refreshFailed", message: "Network error", now: at(1) });
    expect(band(s, at(1))).toEqual(["fresh_lead:lead1"]);
    expect(healthOf(s)[0]).toMatchObject({ status: "error", lastSuccessfulFetchAt: at(0) });
    expect(healthOf(s)[0].errorMessage).toMatch(/^Refresh failed \d\d:\d\d: Network error$/);
    s = poll(s, [fresh(1, -60)], at(2));
    expect(healthOf(s)[0].status).toBe("ready");
  });

  it("an ack hides the lead for good and moves the watermark forward over an unbroken run only", () => {
    let s = start([fresh(1, -30), fresh(2, -20), fresh(3, -10)]);
    const before = s.watermark;
    s = signalsReducer(s, { type: "ack", signalKey: "fresh_lead:lead2", now: at(1) });
    expect(s.watermark).toBe(before);
    expect(Object.keys(s.acked)).toEqual(["fresh_lead:lead2"]);
    s = signalsReducer(s, { type: "ack", signalKey: "fresh_lead:lead1", now: at(1) });
    expect(s.watermark).toBe(at(-20));
    expect(s.acked).toEqual({});
    expect(band(s, at(1))).toEqual(["fresh_lead:lead3"]);
    const moved = s.watermark;
    s = poll(s, [fresh(1, -30), fresh(2, -20), fresh(3, -10)], at(2));
    expect(s.watermark).toBe(moved);
    expect(band(s, at(2))).toEqual(["fresh_lead:lead3"]);
  });

  it("the watermark, acks and snoozes survive a round-trip through storage", () => {
    const local = fakeStorage();
    const session = fakeStorage();
    const key = memoryKey("org-1");
    let s = start([fresh(1, -30), fresh(2, -20), fresh(3, -10)]);
    s = signalsReducer(s, { type: "ack", signalKey: "fresh_lead:lead1", now: at(1) });
    s = signalsReducer(s, { type: "ack", signalKey: "fresh_lead:lead3", now: at(1) });
    s = signalsReducer(s, { type: "snooze", signalKey: "fresh_lead:lead2", until: at(60), now: at(1) });
    s = signalsReducer(s, { type: "setQuiet", quiet: true, now: at(1) });
    expect(writeMemory(() => local.store, () => session.store, key, s)).toBe(true);
    expect(local.map.get(key)).not.toContain("Lead ");
    const memory = readMemory(() => local.store, () => session.store, key);
    expect(memory).toMatchObject({ memoryOnly: false, local: { watermark: at(-30), acked: { "fresh_lead:lead3": at(-10) }, snoozed: { "fresh_lead:lead2": at(60) } }, session: { quiet: true } });
    const back = initialSignalsState(viewOf([fresh(1, -30), fresh(2, -20), fresh(3, -10)]), memory, at(2));
    expect(band(back, at(2))).toEqual([]);
    expect(deferredOf(back, at(2)).map((d) => d.signalKey)).toEqual(["fresh_lead:lead2"]);
  });

  it("storage that throws falls back to memory", () => {
    const memory = readMemory(() => throwing, () => throwing, "k");
    expect(memory.memoryOnly).toBe(true);
    expect(memory.local.watermark).toBeNull();
    expect(readMemory(null, null, "k").memoryOnly).toBe(true);
    expect(writeMemory(() => throwing, () => throwing, "k", start([]))).toBe(false);
  });

  it("a snooze moves the lead to deferred and back at its time", () => {
    let s = start([fresh(1, -30)]);
    s = signalsReducer(s, { type: "snooze", signalKey: "fresh_lead:lead1", until: at(15), now: at(1) });
    expect(band(s, at(1))).toEqual([]);
    expect(deferredOf(s, at(1))).toMatchObject([{ signalKey: "fresh_lead:lead1", until: at(15) }]);
    s = signalsReducer(s, { type: "tick", now: at(16) });
    expect(band(s, at(16))).toEqual(["fresh_lead:lead1"]);
    expect(deferredOf(s, at(16))).toEqual([]);
    expect(s.snoozed).toEqual({});
  });

  it("Show now brings a snoozed lead straight back", () => {
    let s = start([fresh(1, -30)]);
    s = signalsReducer(s, { type: "snooze", signalKey: "fresh_lead:lead1", until: at(60), now: at(1) });
    s = signalsReducer(s, { type: "showNow", signalKey: "fresh_lead:lead1", now: at(2) });
    expect(band(s, at(2))).toEqual(["fresh_lead:lead1"]);
  });
});

describe("protected time (AC2)", () => {
  it("quiet mode holds new arrivals in deferred, announced, with nothing to announce; leaving does not re-announce", () => {
    let s = signalsReducer(start([]), { type: "setQuiet", quiet: true, now: at(0) });
    s = poll(s, [fresh(1, 1)], at(2));
    expect(isProtected(s, at(2))).toBe(true);
    expect(band(s, at(2))).toEqual([]);
    expect(deferredOf(s, at(2)).map((d) => d.signalKey)).toEqual(["fresh_lead:lead1"]);
    expect(s.announced).toContain("fresh_lead:lead1");
    expect(toAnnounce(s, at(2))).toEqual([]);
    expect(s.pulsing).toEqual([]);
    s = signalsReducer(s, { type: "setQuiet", quiet: false, now: at(3) });
    expect(band(s, at(3))).toEqual(["fresh_lead:lead1"]);
    expect(s.pulsing).toEqual([]);
    expect(toAnnounce(s, at(3))).toEqual([]);
  });

  it("a class in progress does the same until it ends; Show now recovers one during the class", () => {
    const teaching = { state: "teaching" as const, until: at(30), title: "MHF4U class" };
    let s = poll(start([]), [fresh(1, 1), fresh(2, 2)], at(3), teaching);
    expect(band(s, at(3))).toEqual([]);
    expect(deferredOf(s, at(3))).toHaveLength(2);
    expect(snoozeOptions(s, at(3)).map((o) => o.label)).toEqual(["15 min", "1 hour", "After this class", "Tomorrow 08:00"]);
    s = signalsReducer(s, { type: "showNow", signalKey: "fresh_lead:lead2", now: at(4) });
    expect(band(s, at(4))).toEqual(["fresh_lead:lead2"]);
    expect(s.pulsing).toEqual([]);
    s = signalsReducer(s, { type: "tick", now: at(31) });
    expect(isProtected(s, at(31))).toBe(false);
    expect(band(s, at(31))).toEqual(["fresh_lead:lead1", "fresh_lead:lead2"]);
    expect(s.pulsing).toEqual([]);
  });

  it("tomorrow 08:00 is Toronto time", () => {
    expect(snoozeOptions(start([]), at(0)).at(-1)).toEqual({ label: "Tomorrow 08:00", until: "2026-10-23T12:00:00.000Z" });
  });
});

describe("dismiss (AC4)", () => {
  it("hides the signal for the window, then shows it again while it holds; one gone from the view stays gone", () => {
    let s = start([overdue, fresh(1, -10)]);
    s = signalsReducer(s, { type: "dismiss", signalKey: overdue.signalKey, now: at(0) });
    s = signalsReducer(s, { type: "dismiss", signalKey: "fresh_lead:lead1", now: at(0) });
    expect(exceptionsOf(s, at(1))).toEqual([]);
    expect(band(s, at(1))).toEqual([]);
    s = signalsReducer(s, { type: "tick", now: at(119) });
    expect(exceptionsOf(s, at(119))).toEqual([]);
    s = poll(s, [overdue], at(121));
    expect(exceptionsOf(s, at(121)).map((x) => x.signalKey)).toEqual([overdue.signalKey]);
    expect(band(s, at(121))).toEqual([]);
    expect(s.dismissed).toEqual({});
  });
});
