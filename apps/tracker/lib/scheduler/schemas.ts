import { z } from "zod";

/**
 * Strict output schemas. Handlers parse every body through these before
 * sending, so an extra field throws in tests instead of leaking. Teacher shape
 * has no email; admin adds it. Nothing financial exists here.
 */
export const StaffPublicTeacher = z.strictObject({
  id: z.guid(),
  name: z.string(),
  subjects: z.array(z.string()),
});
export const StaffPublicAdmin = z.strictObject({
  id: z.guid(),
  name: z.string(),
  subjects: z.array(z.string()),
  email: z.string().nullable(),
});

export const MeResponse = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("teacher"), staff: StaffPublicTeacher }),
  z.strictObject({ scope: z.literal("admin"), staff: StaffPublicAdmin.nullable() }),
  z.strictObject({ scope: z.literal("none") }),
]);
export const StaffListResponse = z.strictObject({ staff: z.array(StaffPublicAdmin) });
export const StaffResponseTeacher = z.strictObject({ staff: StaffPublicTeacher });
export const StaffResponseAdmin = z.strictObject({ staff: StaffPublicAdmin });

// Scheduling (REQ-3) ------------------------------------------------------------
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Interval = z.strictObject({ start: z.string(), end: z.string() });

export const OccurrenceTeacher = z.strictObject({
  occurrenceKey: z.string(),
  seriesId: z.guid(),
  originalDate: IsoDate,
  date: IsoDate,
  startTime: Hhmm,
  endTime: z.string(),
  durationMinutes: z.number().int(),
  startsAt: z.string(),
  endsAt: z.string(),
  staffId: z.guid(),
  studentId: z.guid(),
  subject: z.string(),
  status: z.enum(["scheduled", "cancelled", "moved"]),
  kind: z.enum(["one_off", "weekly"]),
  purpose: z.enum(["makeup", "trial", "extra"]).nullable(),
});
/** Admin also gets the series' version token, needed to send an edit. */
export const OccurrenceAdmin = OccurrenceTeacher.extend({ seriesUpdatedAt: z.string() }).strict();
export const OccurrencesResponseTeacher = z.strictObject({ occurrences: z.array(OccurrenceTeacher) });
export const OccurrencesResponseAdmin = z.strictObject({ occurrences: z.array(OccurrenceAdmin) });

const ConflictReason = z.enum(["time_off", "outside_availability"]);
export const ConflictTeacher = OccurrenceTeacher.extend({ reason: ConflictReason }).strict();
export const ConflictAdmin = OccurrenceAdmin.extend({ reason: ConflictReason }).strict();
export const ConflictsResponseTeacher = z.strictObject({ conflicts: z.array(ConflictTeacher) });
export const ConflictsResponseAdmin = z.strictObject({ conflicts: z.array(ConflictAdmin), notEntered: z.array(z.guid()) });

// Weekly calendar (REQ-6) -------------------------------------------------------------
const WeekExtras = { studentName: z.string().nullable(), conflict: ConflictReason.nullable() };
export const WeekOccurrenceTeacher = OccurrenceTeacher.extend(WeekExtras).strict();
export const WeekOccurrenceAdmin = OccurrenceAdmin.extend(WeekExtras).strict();
const WeekDay = z.strictObject({
  date: IsoDate,
  state: z.enum(["available", "unavailable", "not_entered"]),
  intervals: z.array(Interval),
  availableMinutes: z.number().int(),
});
export const WeekTotals = z.strictObject({
  scheduledMinutes: z.number().int(),
  availableMinutes: z.number().int().nullable(),
  remainingMinutes: z.number().int().nullable(),
});
export const WeekResponseTeacher = z.strictObject({
  weekStart: IsoDate,
  today: IsoDate,
  namesLoaded: z.boolean(),
  teachers: z.array(z.strictObject({ staff: StaffPublicTeacher, days: z.array(WeekDay), occurrences: z.array(WeekOccurrenceTeacher), totals: WeekTotals })),
});
export const WeekResponseAdmin = z.strictObject({
  weekStart: IsoDate,
  today: IsoDate,
  namesLoaded: z.boolean(),
  teachers: z.array(z.strictObject({ staff: StaffPublicAdmin, days: z.array(WeekDay), occurrences: z.array(WeekOccurrenceAdmin), totals: WeekTotals })),
});
export type WeekResponseAdminT = z.infer<typeof WeekResponseAdmin>;
export type WeekResponseTeacherT = z.infer<typeof WeekResponseTeacher>;

/** The result of regenerating a student's Weekly Schedule after a class write (REQ-4). */
export const SummarySync = z.enum(["synced", "failed", "skipped"]);

/** What a class write did to today's Notion task (REQ-8). */
export const DailyTaskOutcome = z.enum(["updated", "unchanged", "skipped", "failed"]);

export const SeriesResponse = z.strictObject({
  summarySync: SummarySync.optional(),
  dailyTask: DailyTaskOutcome.optional(),
  series: z.strictObject({
    id: z.guid(),
    staffId: z.guid(),
    studentId: z.guid(),
    subject: z.string(),
    kind: z.enum(["one_off", "weekly"]),
    startDate: IsoDate,
    startTime: Hhmm,
    durationMinutes: z.number().int(),
    effectiveUntil: IsoDate.nullable(),
    splitFrom: z.guid().nullable(),
    updatedAt: z.string(),
    purpose: z.enum(["makeup", "trial", "extra"]).nullable(),
    makeupFor: z.guid().nullable(),
  }),
});

/** A student's recent and upcoming cancelled classes, for the owner's "Replaces" choice (REQ-31). Admin only. */
export const CancellationsResponse = z.strictObject({
  cancellations: z.array(z.strictObject({ exceptionId: z.guid(), date: IsoDate, startTime: Hhmm, subject: z.string() })),
});

const Window = z.strictObject({
  id: z.guid(), staffId: z.guid(), weekday: z.number().int(), startTime: Hhmm, endTime: Hhmm,
  effectiveFrom: IsoDate, effectiveUntil: IsoDate.nullable(), updatedAt: z.string(),
});
const AvailabilityExceptionOut = z.strictObject({
  id: z.guid(), staffId: z.guid(), onDate: IsoDate, kind: z.enum(["time_off", "extra"]),
  startTime: Hhmm.nullable(), endTime: Hhmm.nullable(), updatedAt: z.string(),
});
export const WindowResponse = z.strictObject({ window: Window });
export const AvailabilityExceptionResponse = z.strictObject({ exception: AvailabilityExceptionOut });
export const AvailabilityResponse = z.strictObject({
  staffId: z.guid(),
  windows: z.array(Window),
  exceptions: z.array(AvailabilityExceptionOut),
  days: z.array(z.strictObject({
    date: IsoDate,
    state: z.enum(["available", "unavailable", "not_entered"]),
    intervals: z.array(Interval),
    availableMinutes: z.number().int(),
  })),
});

// Weekly Schedule import (REQ-4) ----------------------------------------------------
// Admin only. Student names appear here and nowhere in Postgres.
const RejectCode = z.enum([
  "unparseable_day", "unparseable_time", "no_fixed_time", "invalid_duration", "missing_course", "missing_teacher",
  "teacher_not_found", "teacher_ambiguous", "teacher_inactive", "extra_fields", "duplicate_line",
]);
const RepairLineOut = z.strictObject({ text: z.string(), status: z.union([z.literal("ok"), RejectCode]), hint: z.string().optional() });
export const ImportPlanOut = z.strictObject({
  ready: z.array(z.strictObject({ studentId: z.guid(), name: z.string(), lineCount: z.number().int() })),
  repair: z.array(z.strictObject({ studentId: z.guid(), name: z.string(), lines: z.array(RepairLineOut) })),
  skipped: z.array(z.strictObject({ studentId: z.guid() })),
});
const SyncState = z.enum(["pending", "synced", "failed"]);
const AdoptedOut = z.strictObject({
  studentId: z.guid(),
  name: z.string().nullable(),
  adoptedAt: z.string(),
  syncState: SyncState,
  lastError: z.string().nullable(),
  lastWrittenAt: z.string().nullable(),
  lastDriftText: z.string().nullable(),
});
export const ImportPreviewResponse = z.strictObject({ plan: ImportPlanOut, adopted: z.array(AdoptedOut) });
export const ImportRunResponse = z.strictObject({
  dryRun: z.boolean(),
  plan: ImportPlanOut,
  results: z.array(z.strictObject({ studentId: z.guid(), name: z.string(), status: z.enum(["adopted", "failed"]), summarySync: SummarySync })),
});
export const SyncSummariesResponse = z.strictObject({ results: z.array(z.strictObject({ studentId: z.guid(), summarySync: SummarySync })) });

const ReviewItem = z.strictObject({ date: IsoDate, startTime: Hhmm, subject: z.string() });
export const MonthlyReviewResponse = z.strictObject({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  students: z.array(z.strictObject({
    studentId: z.guid(),
    name: z.string().nullable(),
    needsReview: z.boolean(),
    cancelled: z.array(ReviewItem),
    moved: z.array(z.strictObject({ originalDate: IsoDate, date: IsoDate, startTime: Hhmm, subject: z.string() })),
    oneOff: z.array(ReviewItem),
    from: z.array(ReviewItem),
    until: z.array(ReviewItem),
    sync: z.strictObject({ state: SyncState, stale: z.boolean() }),
  })),
});

// Booking (REQ-7) ---------------------------------------------------------------
/** A rejected booking: where and why, never whose other class it hit. */
export const BookingConflictResponse = z.strictObject({
  error: z.literal("booking_conflict"),
  problems: z.array(z.strictObject({
    date: IsoDate,
    startTime: Hhmm,
    endTime: z.string(),
    reason: z.enum(["teacher_busy", "student_busy", "outside_availability", "time_off", "availability_not_entered"]),
  })).max(10),
  more: z.number().int().min(0),
});

// Daily teacher-texts task (REQ-8) ------------------------------------------------
export const DailyTaskStatusResponse = z.strictObject({
  state: z.enum(["none", "pending", "ready", "failed"]),
  pageUrl: z.string().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export const DailyTaskRunResponse = z.strictObject({
  result: z.enum(["created", "updated", "unchanged", "skipped", "busy", "failed"]),
  status: DailyTaskStatusResponse,
});
