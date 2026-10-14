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
});
/** Admin also gets the series' version token, needed to send an edit. */
export const OccurrenceAdmin = OccurrenceTeacher.extend({ seriesUpdatedAt: z.string() }).strict();
export const OccurrencesResponseTeacher = z.strictObject({ occurrences: z.array(OccurrenceTeacher) });
export const OccurrencesResponseAdmin = z.strictObject({ occurrences: z.array(OccurrenceAdmin) });

export const SeriesResponse = z.strictObject({
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
  }),
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
