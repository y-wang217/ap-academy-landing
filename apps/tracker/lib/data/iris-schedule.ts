import { z } from "zod";
import type { StudentSchedule } from "../iris/notice";
import type { Db } from "./client";
import { ExceptionRow, SeriesRow } from "./schedule";

/**
 * The Iris poll's read of one student's classes (REQ-46, tracker ADR 0072),
 * over the service client the run already holds. Select only, parsed with the
 * scheduler's own row schemas (ADR 0017). Every query error throws, so a
 * failed read never looks like "no classes" (the listSeriesForStudent rule).
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
  };
}
