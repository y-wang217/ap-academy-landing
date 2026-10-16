import type { ClassException } from "../../../lib/domain/schedule/recurrence";
import { addDays, isoWeekday } from "../../../lib/domain/schedule/wallclock";
import type { BookingKey, LockedWrite, Position, ScheduleStore, SeriesRecord, StoreError, StoreResult, WriteReplay } from "../../../lib/scheduler/schedule-store";

/**
 * The locked class write of migration 0018 (tracker ADR 0050), in memory, with
 * the database's semantics: the request ID is claimed before the op (a repeat
 * replays, another op or series is `request_reused`), every stamp the caller
 * read must be unchanged (`booking_changed`), the version and position checks
 * repeat, and every write moves the stamps of the people it touches. Shared by
 * the fake stores in the route tests.
 */
export function lockedWrites(state: {
  series: Map<string, SeriesRecord>;
  exceptions: (ClassException & { requestId?: string })[];
  newId: () => string;
  /** updated_at of a changed row; a new row gets CREATED. */
  stampOf?: () => string;
}) {
  const CREATED = "2026-10-14T12:00:00.000Z";
  const stampOf = state.stampOf ?? (() => "2026-10-14T15:00:00.000Z");
  const stamps = new Map<string, number>();
  const log = new Map<string, WriteReplay>();
  const name = (k: BookingKey) => `${k.kind}:${k.id}`;
  const keysOf = (...people: { staffId?: string; studentId?: string }[]): BookingKey[] => [
    ...new Map(people.flatMap((p) => [
      ...(p.staffId ? [{ kind: "staff" as const, id: p.staffId }] : []),
      ...(p.studentId ? [{ kind: "student" as const, id: p.studentId }] : []),
    ]).map((k) => [name(k), k])).values(),
  ];
  /** A change made outside the locked write (another tab, a teacher's availability edit). */
  const bump = (...keys: BookingKey[]) => {
    for (const k of new Set(keys.map(name))) stamps.set(k, (stamps.get(k) ?? 0) + 1);
  };
  const fail = (status: StoreError["status"], error: StoreError["error"]): StoreError => ({ ok: false, status, error });

  const positionOf = (s: SeriesRecord, date: string): Position => {
    const e = state.exceptions.find((x) => x.seriesId === s.id && x.originalDate === date);
    if (e?.kind === "moved" && e.newDate && e.newStartTime) return { status: "moved", date: e.newDate, startTime: e.newStartTime };
    return { status: e?.kind === "cancelled" ? "cancelled" : "scheduled", date, startTime: s.startTime };
  };
  const upsertException = (e: ClassException & { requestId: string }) => {
    const i = state.exceptions.findIndex((x) => x.seriesId === e.seriesId && x.originalDate === e.originalDate);
    if (i >= 0) state.exceptions[i] = e;
    else state.exceptions.push(e);
  };
  const update = (s: SeriesRecord, patch: Partial<SeriesRecord>) => {
    const next = { ...s, ...patch, updatedAt: stampOf() };
    state.series.set(s.id, next);
    return next;
  };

  function write(w: LockedWrite): StoreResult<SeriesRecord> {
    const s = w.op === "create" ? undefined : state.series.get(w.seriesId);
    if (w.op !== "create" && !s) return fail(404, "not_found");
    const keys = w.op === "create" ? keysOf(w.series)
      : w.op === "edit_one_off" ? keysOf(s!, { staffId: w.fields.staffId })
        : w.op === "split" ? keysOf(s!, { staffId: w.changes.staffId, studentId: w.changes.studentId })
          : keysOf(s!);

    const prior = log.get(w.requestId);
    if (prior) {
      if (prior.op === w.op && (w.op === "create" || prior.seriesId === w.seriesId)) return { ok: true, value: prior.result, created: false };
      return fail(400, "request_reused");
    }
    for (const k of keys) {
      const seen = w.stamps.find((x) => x.kind === k.kind && x.id === k.id);
      if (!seen || seen.version !== (stamps.get(name(k)) ?? 0)) return fail(409, "booking_changed");
    }
    if (s && w.op !== "create") {
      if (s.updatedAt !== w.expectedUpdatedAt) return fail(409, "stale");
      if ("expectedPosition" in w) {
        const now = positionOf(s, w.originalDate);
        if (now.status !== w.expectedPosition.status || now.date !== w.expectedPosition.date || now.startTime !== w.expectedPosition.startTime) return fail(409, "stale");
      }
    }

    let result: SeriesRecord;
    switch (w.op) {
      case "create":
        result = { ...w.series, id: state.newId(), updatedAt: CREATED, splitFrom: null };
        state.series.set(result.id, result);
        break;
      case "move":
        upsertException({ seriesId: s!.id, originalDate: w.originalDate, kind: "moved", newDate: w.newDate, newStartTime: w.newStartTime, requestId: w.requestId });
        result = s!;
        break;
      case "cancel":
        upsertException({ seriesId: s!.id, originalDate: w.originalDate, kind: "cancelled", newDate: null, newStartTime: null, requestId: w.requestId });
        result = s!;
        break;
      case "edit_one_off":
        if (w.move) upsertException({ seriesId: s!.id, originalDate: w.originalDate, kind: "moved", ...w.move, requestId: w.requestId });
        result = Object.keys(w.fields).length ? update(s!, w.fields) : s!;
        break;
      case "split": {
        if (s!.kind !== "weekly") return fail(422, "not_weekly");
        const { weekday, ...changes } = w.changes;
        const from = w.fromDate;
        let start = addDays(from, (weekday ?? isoWeekday(from)) - isoWeekday(from));
        if (start < from) start = addDays(start, 7);
        result = { ...s!, ...changes, id: state.newId(), startDate: start, splitFrom: s!.id, updatedAt: CREATED };
        state.series.set(result.id, result);
        update(s!, { effectiveUntil: addDays(from, -1) });
        break;
      }
      case "end_series":
        result = update(s!, { effectiveUntil: w.lastDate });
        break;
    }
    bump(...keys);
    log.set(w.requestId, { op: w.op, seriesId: w.op === "create" ? result.id : s!.id, result });
    return { ok: true, value: result, created: true };
  }

  const methods: Pick<ScheduleStore, "readWriteContext" | "lockedWrite"> = {
    readWriteContext: async (requestId, keys) => ({
      stamps: keysOf(...keys.map((k) => (k.kind === "staff" ? { staffId: k.id } : { studentId: k.id })))
        .map((k) => ({ ...k, version: stamps.get(name(k)) ?? 0 })),
      replay: log.get(requestId) ?? null,
    }),
    lockedWrite: async (w) => write(w),
  };
  return { methods, bump, log };
}
