import { z } from "zod";
import type { TeacherCalendar } from "../iris/makeup";
import type { StudentSchedule } from "../iris/notice";
import type { Db } from "./client";
import { AvailabilityExceptionRow, ExceptionRow, SeriesRow, WindowRow } from "./schedule";

/**
 * The Iris poll's read of one student's classes (REQ-46, tracker ADR 0072),
 * over the service client the run already holds. Select only, parsed with the
 * scheduler's own row schemas (ADR 0017). Every query error throws, so a
 * failed read never looks like "no classes" (the listSeriesForStudent rule).
 * REQ-47 (tracker ADR 0075) adds one teacher's whole calendar, with no date
 * filter, so a failed read never looks like "nothing entered" either.
 */
export function createIrisScheduleReader(tracker: Db["tracker"], orgId: string) {
  return {
    async forStudent(studentId: string): Promise<StudentSchedule> {
      const s = await tracker.from("class_series").select().eq("org_id", orgId).eq("notion_student_id", studentId);
      if (s.error) throw new Error("schedule unavailable");
      const series = z.array(SeriesRow).parse(s.data ?? []);
      if (series.length === 0) return { series, exceptions: [] };
      const e = await tracker.from("class_exceptions").select().eq("org_id", orgId).in("series_id", series.map((r) => r.id));
      if (e.error) throw new Error("schedule unavailable");
      return { series, exceptions: z.array(ExceptionRow).parse(e.data ?? []) };
    },

    async forTeacher(staffId: string): Promise<TeacherCalendar> {
      const [s, w, a] = await Promise.all([
        tracker.from("class_series").select().eq("org_id", orgId).eq("notion_staff_id", staffId),
        tracker.from("availability_windows").select().eq("org_id", orgId).eq("notion_staff_id", staffId),
        tracker.from("availability_exceptions").select().eq("org_id", orgId).eq("notion_staff_id", staffId),
      ]);
      if (s.error || w.error || a.error) throw new Error("schedule unavailable");
      const series = z.array(SeriesRow).parse(s.data ?? []);
      const windows = z.array(WindowRow).parse(w.data ?? []);
      const availabilityExceptions = z.array(AvailabilityExceptionRow).parse(a.data ?? []);
      if (series.length === 0) return { series, exceptions: [], windows, availabilityExceptions };
      const e = await tracker.from("class_exceptions").select().eq("org_id", orgId).in("series_id", series.map((r) => r.id));
      if (e.error) throw new Error("schedule unavailable");
      return { series, exceptions: z.array(ExceptionRow).parse(e.data ?? []), windows, availabilityExceptions };
    },
  };
}
