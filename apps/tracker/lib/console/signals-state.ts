import { addDays, localToUtc } from "../domain/schedule/wallclock";
import { TUNING } from "../domain/tuning";
import { todayIso } from "../time";
import { hhmm } from "./format";
import type { HealthEntry, Signal, SignalsView } from "./signals";

/**
 * The signals' client state (REQ-62, tracker ADR 0077). Pure, so it is tested
 * in node without a DOM, like sales-state.ts. The browser holds the fresh-lead
 * watermark, acknowledgements, announcements and snoozes (localStorage, ids
 * and times only) and quiet mode and dismissals (sessionStorage). Nothing here
 * writes to Notion or Supabase: a dismissal or a snooze only changes this
 * console's display. Every action carries its own `now`.
 */
export type SignalsState = {
  view: SignalsView;
  failure: { at: string; message: string } | null;
  /** Fresh leads created at or before this are not fresh. It only moves forward. */
  watermark: string;
  /** Acknowledged fresh leads above the watermark: signalKey to createdAt. */
  acked: Record<string, string>;
  /** Signals already announced once, so a poll never announces them again. */
  announced: string[];
  /** Signals that arrived while protected, kept in the deferred strip until protected time ends or Show now. */
  held: string[];
  snoozed: Record<string, string>;
  dismissed: Record<string, string>;
  quiet: boolean;
  /** Announced on the last settle while not protected: the band pulses these once. */
  pulsing: string[];
  memoryOnly: boolean;
  /** The `now` of the last action: the provider's clock. */
  clock: string;
  /** False until the browser memory has been read, so the defaults never overwrite it. */
  hydrated: boolean;
};

export type SignalsAction =
  | { type: "refreshOk"; view: SignalsView; now: string }
  | { type: "refreshFailed"; message: string; now: string }
  | { type: "ack"; signalKey: string; now: string }
  | { type: "snooze"; signalKey: string; until: string; now: string }
  | { type: "dismiss"; signalKey: string; now: string }
  | { type: "showNow"; signalKey: string; now: string }
  | { type: "setQuiet"; quiet: boolean; now: string }
  | { type: "tick"; now: string }
  | { type: "hydrate"; memory: { local: StoredLocal; session: StoredSession; memoryOnly: boolean }; now: string }
  | { type: "memoryLost" }
  | { type: "pulseEnd" };

/** What survives a reload: localStorage holds `local`, sessionStorage holds `session`. */
export type StoredLocal = { watermark: string | null; acked: Record<string, string>; announced: string[]; snoozed: Record<string, string> };
export type StoredSession = { quiet: boolean; dismissed: Record<string, string> };
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const ANNOUNCED_CAP = 500;
const t = (iso: string) => Date.parse(iso);

export const memoryKey = (orgId: string) => `console.signals.v1:${orgId}`;

const record = (v: unknown): Record<string, string> =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string" && !Number.isNaN(t(x)))) as Record<string, string> : {};

/** Reads both stores. A store that throws, or holds junk, gives the defaults and memoryOnly. */
export function readMemory(local: (() => StorageLike) | null, session: (() => StorageLike) | null, key: string): { local: StoredLocal; session: StoredSession; memoryOnly: boolean } {
  let memoryOnly = false;
  const parse = (store: (() => StorageLike) | null): Record<string, unknown> => {
    try {
      if (!store) throw new Error("no storage");
      const raw = store().getItem(key);
      const v: unknown = raw ? JSON.parse(raw) : {};
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      memoryOnly = true;
      return {};
    }
  };
  const l = parse(local);
  const s = parse(session);
  const watermark = typeof l.watermark === "string" && !Number.isNaN(t(l.watermark)) ? l.watermark : null;
  const announced = Array.isArray(l.announced) ? l.announced.filter((x): x is string => typeof x === "string") : [];
  return {
    local: { watermark, acked: record(l.acked), announced, snoozed: record(l.snoozed) },
    session: { quiet: s.quiet === true, dismissed: record(s.dismissed) },
    memoryOnly,
  };
}

/** Writes both stores; false when either throws, so the panel can say memory is this tab only. */
export function writeMemory(local: (() => StorageLike) | null, session: (() => StorageLike) | null, key: string, state: SignalsState): boolean {
  try {
    if (!local || !session) return false;
    const l: StoredLocal = { watermark: state.watermark, acked: state.acked, announced: state.announced, snoozed: state.snoozed };
    const s: StoredSession = { quiet: state.quiet, dismissed: state.dismissed };
    local().setItem(key, JSON.stringify(l));
    session().setItem(key, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function initialSignalsState(view: SignalsView, memory: { local: StoredLocal; session: StoredSession; memoryOnly: boolean }, now: string): SignalsState {
  const first = new Date(t(now) - TUNING.consoleFreshLeadLookbackHours * 3_600_000).toISOString();
  const state: SignalsState = {
    view, failure: null, watermark: memory.local.watermark ?? first, acked: memory.local.acked, announced: memory.local.announced, held: [],
    snoozed: memory.local.snoozed, dismissed: memory.session.dismissed, quiet: memory.session.quiet, pulsing: [], memoryOnly: memory.memoryOnly,
    clock: now, hydrated: false,
  };
  // A reload announces nothing: what is on screen at load was there before.
  return settle({ ...state, announced: [...new Set([...state.announced, ...eligible(state, now).map((s) => s.signalKey)])].slice(-ANNOUNCED_CAP) }, now);
}

/** Quiet mode, or the owner's own class in progress now. */
export function isProtected(state: SignalsState, now: string): boolean {
  const p = state.view.protectedTime;
  return state.quiet || (p.state === "teaching" && t(p.until) > t(now));
}

const snoozedNow = (state: SignalsState, key: string, now: string) => state.snoozed[key] !== undefined && t(state.snoozed[key]) > t(now);
const dismissedNow = (state: SignalsState, key: string, now: string) =>
  state.dismissed[key] !== undefined && t(now) - t(state.dismissed[key]) < TUNING.consoleSignalDismissMinutes * 60_000;
const fresh = (state: SignalsState, s: Signal) => s.kind === "fresh_lead" && s.createdAt !== null && t(s.createdAt) > t(state.watermark) && !(s.signalKey in state.acked);

/** Fresh leads that belong in the band if nothing holds them back. */
function eligible(state: SignalsState, now: string): Signal[] {
  return state.view.signals.filter((s) => fresh(state, s) && !snoozedNow(state, s.signalKey, now) && !dismissedNow(state, s.signalKey, now));
}

/** The band: fresh, unacknowledged, not snoozed, not dismissed, not held by protected time. Oldest first. */
export function bandOf(state: SignalsState, now: string): Signal[] {
  return eligible(state, now).filter((s) => !state.held.includes(s.signalKey)).sort((a, b) => t(a.createdAt!) - t(b.createdAt!));
}

/** The deferred strip: snoozed signals and those held while protected, still in the view. */
export function deferredOf(state: SignalsState, now: string): (Signal & { until: string | null })[] {
  return state.view.signals
    .filter((s) => snoozedNow(state, s.signalKey, now) || (state.held.includes(s.signalKey) && eligible(state, now).includes(s)))
    .map((s) => ({ ...s, until: snoozedNow(state, s.signalKey, now) ? state.snoozed[s.signalKey] : null }));
}

/** The signals panel's rows: every exception that is not snoozed or dismissed. Fresh leads live in the band. */
export function exceptionsOf(state: SignalsState, now: string): Signal[] {
  return state.view.signals.filter((s) => s.kind !== "fresh_lead" && !snoozedNow(state, s.signalKey, now) && !dismissedNow(state, s.signalKey, now));
}

/** Band items not announced yet. Empty while protected: settle holds them instead. */
export function toAnnounce(state: SignalsState, now: string): string[] {
  if (isProtected(state, now)) return [];
  return bandOf(state, now).map((s) => s.signalKey).filter((k) => !state.announced.includes(k));
}

/** The health rail: the view's, or every entry red with the refresh failure while one stands. */
export function healthOf(state: SignalsState): HealthEntry[] {
  if (!state.failure) return state.view.health;
  const message = `Refresh failed ${hhmm(state.failure.at)}: ${state.failure.message}`;
  return state.view.health.map((h) => ({ ...h, status: "error", lastCheckedAt: state.failure!.at, staleReason: null, errorMessage: message }));
}

/** The snooze menu: 15 min, 1 h, after this class when the end is known, and tomorrow 08:00 Toronto. */
export function snoozeOptions(state: SignalsState, now: string): { label: string; until: string }[] {
  const at = t(now);
  const options = [
    { label: "15 min", until: new Date(at + 15 * 60_000).toISOString() },
    { label: "1 hour", until: new Date(at + 3_600_000).toISOString() },
  ];
  const p = state.view.protectedTime;
  if (p.state === "teaching" && t(p.until) > at) options.push({ label: "After this class", until: p.until });
  options.push({ label: "Tomorrow 08:00", until: localToUtc(addDays(todayIso(new Date(at)), 1), "08:00") });
  return options;
}

/** Arrivals: held and marked announced while protected; announced and pulsed once otherwise. Expired snoozes and dismissals drop. */
function settle(state: SignalsState, now: string): SignalsState {
  const at = t(now);
  const snoozed = Object.fromEntries(Object.entries(state.snoozed).filter(([, until]) => t(until) > at));
  const dismissed = Object.fromEntries(Object.entries(state.dismissed).filter(([, when]) => at - t(when) < TUNING.consoleSignalDismissMinutes * 60_000));
  const next = { ...state, snoozed, dismissed };
  const arrivals = eligible(next, now).map((s) => s.signalKey).filter((k) => !next.announced.includes(k));
  if (isProtected(next, now)) {
    return { ...next, held: [...new Set([...next.held, ...arrivals])], announced: [...next.announced, ...arrivals].slice(-ANNOUNCED_CAP), pulsing: [] };
  }
  // Protected time is over: held signals return to the band quietly, already announced.
  return { ...next, held: [], announced: [...next.announced, ...arrivals].slice(-ANNOUNCED_CAP), pulsing: arrivals };
}

/** After an ack, the watermark moves up past every acknowledged lead in an unbroken run from the bottom. */
function advance(state: SignalsState): SignalsState {
  const candidates = state.view.signals.filter((s) => s.kind === "fresh_lead" && s.createdAt !== null && t(s.createdAt) > t(state.watermark))
    .sort((a, b) => t(a.createdAt!) - t(b.createdAt!));
  let watermark = state.watermark;
  for (const c of candidates) {
    if (!(c.signalKey in state.acked)) break;
    watermark = c.createdAt!;
  }
  const acked = Object.fromEntries(Object.entries(state.acked).filter(([, created]) => t(created) > t(watermark)));
  return { ...state, watermark, acked };
}

export function signalsReducer(state: SignalsState, action: SignalsAction): SignalsState {
  const next = reduce(state, action);
  return "now" in action && next.clock !== action.now ? { ...next, clock: action.now } : next;
}

function reduce(state: SignalsState, action: SignalsAction): SignalsState {
  switch (action.type) {
    case "refreshOk":
      return settle({ ...state, view: action.view, failure: null }, action.now);
    case "refreshFailed":
      return settle({ ...state, failure: { at: action.now, message: action.message } }, action.now);
    case "ack": {
      const signal = state.view.signals.find((s) => s.signalKey === action.signalKey);
      if (!signal || signal.kind !== "fresh_lead" || signal.createdAt === null) return state;
      const held = state.held.filter((k) => k !== action.signalKey);
      return settle(advance({ ...state, held, acked: { ...state.acked, [action.signalKey]: signal.createdAt } }), action.now);
    }
    case "snooze":
      return settle({ ...state, snoozed: { ...state.snoozed, [action.signalKey]: action.until }, held: state.held.filter((k) => k !== action.signalKey) }, action.now);
    case "dismiss":
      return settle({ ...state, dismissed: { ...state.dismissed, [action.signalKey]: action.now } }, action.now);
    case "showNow": {
      const snoozed = Object.fromEntries(Object.entries(state.snoozed).filter(([k]) => k !== action.signalKey));
      const announced = state.announced.includes(action.signalKey) ? state.announced : [...state.announced, action.signalKey];
      return settle({ ...state, snoozed, announced, held: state.held.filter((k) => k !== action.signalKey) }, action.now);
    }
    case "setQuiet":
      return settle({ ...state, quiet: action.quiet }, action.now);
    case "tick":
      return settle(state, action.now);
    case "hydrate":
      // The browser's memory, read after the first render; the view and any failure stay.
      return { ...initialSignalsState(state.view, action.memory, action.now), failure: state.failure, hydrated: true };
    case "memoryLost":
      return state.memoryOnly ? state : { ...state, memoryOnly: true };
    case "pulseEnd":
      return state.pulsing.length ? { ...state, pulsing: [] } : state;
  }
}
