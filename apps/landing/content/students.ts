// The roster: every student on the lesson log, and how they are doing.
//
// Source of truth is the Notion "Students & Parents Tracker" (Business HQ /
// Records): the Students & Parents table and the Lessons log that every
// teacher fills within 24 hours of a lesson. Copy entries from that log by
// hand; never invent or round a number. When a new test score is logged, add
// it to `marks`; when the teacher's read changes, replace `status` and
// `statusDate`. Bump ROSTER_UPDATED whenever this file changes.
//
// Names are first name plus last initial, never a surname. These are minors:
// get the parent's okay before an entry goes live. An entry with
// `listed: false` is kept so the count of earlier students stays honest, but
// it renders nothing beyond that count.
//
// The roster section hides itself while no entry is listed, the same way the
// proof section hides while content/reviews.ts is empty.

export const ROSTER_UPDATED = "October 5, 2026";

export type Mark = {
  course: string; // "SPH3U"
  label: string; // "May 3": the lesson date the score was logged on
  value: number; // percent
};

export type StudentEntry = {
  id: string;
  name: string; // "DJ B."
  grade: 10 | 11 | 12 | "alumni";
  courses: string[]; // course names as a parent reads them
  teacher?: string;
  since: string; // "May 2026"
  lessonsLogged: number;
  marks: Mark[]; // chronological; empty until a score is logged
  status: string; // the teacher's most recent read, one or two sentences
  statusDate?: string; // "Oct 4, 2026"
  outcome?: string; // alumni only: "Waterloo Electrical Engineering"
  listed: boolean;
  preLog?: true; // taught before the lesson log began (April 2026)
};

export const STUDENTS: StudentEntry[] = [];

export const LISTED_STUDENTS = STUDENTS.filter((s) => s.listed);
export const PRE_LOG_COUNT = STUDENTS.filter((s) => !s.listed && s.preLog).length;

/**
 * The series the hero graphic draws: the first listed student with at least
 * two scores in one course. Null while the roster is empty, in which case the
 * graphic shows the shape of a log entry with no numbers on it.
 */
export function featuredSeries(): { student: StudentEntry; course: string; marks: Mark[] } | null {
  for (const student of LISTED_STUDENTS) {
    const byCourse = new Map<string, Mark[]>();
    for (const m of student.marks) byCourse.set(m.course, [...(byCourse.get(m.course) ?? []), m]);
    for (const [course, marks] of byCourse) {
      if (marks.length >= 2) return { student, course, marks };
    }
  }
  return null;
}
