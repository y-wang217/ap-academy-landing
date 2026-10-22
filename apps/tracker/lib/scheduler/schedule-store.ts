import type { AvailabilityException, AvailabilityWindow } from "../domain/schedule/availability";
import type { ClassException, ClassPurpose, ClassSeries } from "../domain/schedule/recurrence";

export type WindowRecord = AvailabilityWindow & { id: string; staffId: string; updatedAt: string };
export type AvailabilityExceptionRecord = AvailabilityException & { id: string; staffId: string; updatedAt: string };
export type SeriesRecord = ClassSeries & { updatedAt: string; splitFrom: string | null };

export type StoreError = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 422 | 503;
  error: "not_found" | "stale" | "past_occurrence" | "not_weekly" | "unavailable" | "booking_changed" | "request_reused" | "forbidden" | "has_outcome";
};
export type StoreResult<T> = { ok: true; value: T; created: boolean } | StoreError;

export type NewWindow = Omit<WindowRecord, "id" | "updatedAt"> & { requestId: string };
export type NewAvailabilityException = Omit<AvailabilityExceptionRecord, "id" | "updatedAt"> & { requestId: string };
export type NewSeries = Omit<SeriesRecord, "id" | "updatedAt" | "splitFrom"> & { requestId: string };
export type SplitChanges = { staffId?: string; studentId?: string; subject?: string; startTime?: string; durationMinutes?: number; weekday?: number };

/** A teacher or a student whose bookings a class write depends on (tracker ADR 0050). */
export type BookingKey = { kind: "staff" | "student"; id: string };
export type BookingStamp = BookingKey & { version: number };
export type WriteOp = "create" | "move" | "cancel" | "edit_one_off" | "split" | "end_series";
/** An earlier write with the same request ID. `seriesId` is its target (for a create, the series it made). */
export type WriteReplay = { op: WriteOp; seriesId: string | null; result: SeriesRecord };
export type WriteContext = { stamps: BookingStamp[]; replay: WriteReplay | null };
/** Where an occurrence stood when the handler checked it; re-checked under the lock. */
export type Position = { status: "scheduled" | "moved" | "cancelled"; date: string; startTime: string };
type Seen = { seriesId: string; expectedUpdatedAt: string };
export type LockedWriteArgs =
  | { op: "create"; series: Omit<NewSeries, "requestId"> }
  | (Seen & { op: "move"; originalDate: string; newDate: string; newStartTime: string; expectedPosition: Position })
  | (Seen & { op: "cancel"; originalDate: string; expectedPosition: Position })
  | (Seen & {
    op: "edit_one_off"; originalDate: string; move: { newDate: string; newStartTime: string } | null;
    /** purpose and makeupFor: null clears, undefined leaves as is. */
    fields: { staffId?: string; subject?: string; durationMinutes?: number; purpose?: ClassPurpose | null; makeupFor?: string | null }; expectedPosition: Position;
  })
  | (Seen & { op: "split"; fromDate: string; changes: SplitChanges })
  | (Seen & { op: "end_series"; lastDate: string });
export type LockedWrite = LockedWriteArgs & { requestId: string; stamps: BookingStamp[] };

export type SummaryState = "pending" | "synced" | "failed";
/** One row per adopted student: the scheduler owns their Weekly Schedule text from adoption on. */
export type SummaryRecord = {
  id: string;
  studentId: string;
  adoptedAt: string;
  adoptedFromText: string;
  lastWrittenText: string | null;
  lastWrittenAt: string | null;
  syncState: SummaryState;
  lastError: string | null;
  lastDriftText: string | null;
  /** When a sync last replaced a hand edit, and when the owner last marked that seen (0026, REQ-34). */
  lastDriftAt: string | null;
  driftSeenAt: string | null;
};
export type AdoptInput = { studentId: string; sourceText: string; series: NewSeries[] };
export type SummaryPatch = { syncState: SummaryState; lastWrittenText?: string; lastError?: string | null; lastDriftText?: string; lastDriftAt?: string };
/** One row the owner saw on the drift notice, with its drift time exactly as the preview returned it. */
export type DriftSeenItem = { studentId: string; lastDriftAt: string | null };

/**
 * Everything the scheduling handlers need from storage. The real one
 * (lib/data/schedule.ts) runs as the signed-in user, so RLS decides what is
 * visible; reads that find nothing return null, which handlers report as 404.
 */
export type ScheduleStore = {
  /** `staffId` omitted: every row the caller's RLS allows. */
  listWindows(staffId?: string): Promise<WindowRecord[]>;
  listAvailabilityExceptions(staffId: string | undefined, range: { from: string; to: string }): Promise<AvailabilityExceptionRecord[]>;
  getWindow(id: string): Promise<WindowRecord | null>;
  createWindow(input: NewWindow): Promise<StoreResult<WindowRecord>>;
  updateWindow(id: string, expectedUpdatedAt: string, changes: Partial<Pick<AvailabilityWindow, "weekday" | "startTime" | "endTime" | "effectiveFrom" | "effectiveUntil">>): Promise<StoreResult<WindowRecord>>;
  deleteWindow(id: string): Promise<boolean>;
  getAvailabilityException(id: string): Promise<AvailabilityExceptionRecord | null>;
  createAvailabilityException(input: NewAvailabilityException): Promise<StoreResult<AvailabilityExceptionRecord>>;
  deleteAvailabilityException(id: string): Promise<boolean>;

  listSeries(range: { from: string; to: string }, staffId?: string): Promise<{ series: SeriesRecord[]; exceptions: ClassException[] }>;
  getSeries(id: string): Promise<SeriesRecord | null>;
  /** The booking stamps of these keys and any earlier write with this request ID. Throws when storage is down. */
  readWriteContext(requestId: string, keys: BookingKey[]): Promise<WriteContext>;
  /**
   * The only class write. Under the keys' locks it refuses with 409
   * `booking_changed` if any stamp moved since readWriteContext, so the check
   * the handler ran on that context still holds. A repeat of a finished request
   * returns its first result with `created: false`.
   */
  lockedWrite(input: LockedWrite): Promise<StoreResult<SeriesRecord>>;

  /** Every series of one student, ended ones included, with all their exceptions. */
  listSeriesForStudent(studentId: string): Promise<{ series: SeriesRecord[]; exceptions: ClassException[] }>;
  getSummary(studentId: string): Promise<SummaryRecord | null>;
  listSummaries(): Promise<SummaryRecord[]>;
  /** One transaction: the student's series and the summary row, or nothing. A repeat returns the existing row. */
  adoptStudent(input: AdoptInput): Promise<StoreResult<SummaryRecord>>;
  markSummary(studentId: string, patch: SummaryPatch): Promise<boolean>;
  /**
   * Marks each row seen only where its drift time is still the one posted, so
   * a drift recorded after the page loaded stays unseen. Returns the rows
   * changed. Throws when storage is down (REQ-34 AC10).
   */
  markDriftSeen(items: DriftSeenItem[]): Promise<number>;
};
