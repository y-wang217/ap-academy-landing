import type { AvailabilityException, AvailabilityWindow } from "../domain/schedule/availability";
import type { ClassException, ClassSeries } from "../domain/schedule/recurrence";

export type WindowRecord = AvailabilityWindow & { id: string; staffId: string; updatedAt: string };
export type AvailabilityExceptionRecord = AvailabilityException & { id: string; staffId: string; updatedAt: string };
export type SeriesRecord = ClassSeries & { updatedAt: string; splitFrom: string | null };

export type StoreError = { ok: false; status: 404 | 409 | 422 | 503; error: "not_found" | "stale" | "past_occurrence" | "not_weekly" | "unavailable" };
export type StoreResult<T> = { ok: true; value: T; created: boolean } | StoreError;

export type NewWindow = Omit<WindowRecord, "id" | "updatedAt"> & { requestId: string };
export type NewAvailabilityException = Omit<AvailabilityExceptionRecord, "id" | "updatedAt"> & { requestId: string };
export type NewSeries = Omit<SeriesRecord, "id" | "updatedAt" | "splitFrom"> & { requestId: string };
export type SplitInput = {
  seriesId: string;
  fromDate: string;
  expectedUpdatedAt: string;
  requestId: string;
  changes: { staffId?: string; studentId?: string; subject?: string; startTime?: string; durationMinutes?: number; weekday?: number };
};

/**
 * Everything the scheduling handlers need from storage. The real one
 * (lib/data/schedule.ts) runs as the signed-in user, so RLS decides what is
 * visible; reads that find nothing return null, which handlers report as 404.
 */
export type ScheduleStore = {
  listWindows(staffId: string): Promise<WindowRecord[]>;
  listAvailabilityExceptions(staffId: string, range: { from: string; to: string }): Promise<AvailabilityExceptionRecord[]>;
  getWindow(id: string): Promise<WindowRecord | null>;
  createWindow(input: NewWindow): Promise<StoreResult<WindowRecord>>;
  updateWindow(id: string, expectedUpdatedAt: string, changes: Partial<Pick<AvailabilityWindow, "weekday" | "startTime" | "endTime" | "effectiveFrom" | "effectiveUntil">>): Promise<StoreResult<WindowRecord>>;
  deleteWindow(id: string): Promise<boolean>;
  getAvailabilityException(id: string): Promise<AvailabilityExceptionRecord | null>;
  createAvailabilityException(input: NewAvailabilityException): Promise<StoreResult<AvailabilityExceptionRecord>>;
  deleteAvailabilityException(id: string): Promise<boolean>;

  listSeries(range: { from: string; to: string }, staffId?: string): Promise<{ series: SeriesRecord[]; exceptions: ClassException[] }>;
  getSeries(id: string): Promise<SeriesRecord | null>;
  createSeries(input: NewSeries): Promise<StoreResult<SeriesRecord>>;
  upsertException(input: ClassException & { requestId: string }): Promise<StoreResult<ClassException>>;
  split(input: SplitInput): Promise<StoreResult<SeriesRecord>>;
};
