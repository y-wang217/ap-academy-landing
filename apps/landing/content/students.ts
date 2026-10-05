// The roster: every student on the lesson log, and how they are doing.
//
// Source of truth is the Notion "Students & Parents Tracker" (Business HQ /
// Records): the Students & Parents table and the Lessons log that every
// teacher fills within 24 hours of a lesson. Copy entries from that log by
// hand; never invent or round a number. When a new test score is logged, add
// it to `marks`; when the teacher's read changes, replace `status` and
// `statusDate`. Bump ROSTER_UPDATED whenever this file changes.
//
// A student is identified only by a number (order of enrolment) and initials.
// No names, no school, no teacher: these are minors, and the number plus
// initials is the whole public identity. An entry with `listed: false` is kept
// so the numbering and the footnote counts stay honest, but it renders nothing
// beyond those counts.
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
  number: number; // order of enrolment; never reused, never renumbered
  initials: string; // "D.B."
  grade: 10 | 11 | 12 | "alumni";
  courses: string[]; // course names as a parent reads them
  since: string; // "May 2026"
  lessonsLogged: number;
  marks: Mark[]; // chronological; empty until a score is logged
  status: string; // the teacher's most recent read, one or two sentences
  statusDate?: string; // "Oct 4, 2026"
  outcome?: string; // alumni only: "Waterloo Electrical Engineering"
  listed: boolean;
  preLog?: true; // taught before the lesson log began (April 2026)
};

export const STUDENTS: StudentEntry[] = [
  // Students 1 to 7 were taught before the lesson log began in April 2026.
  // Counted in the footnote, not shown.
  { id: "s01", number: 1, initials: "O.L.", grade: 12, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false, preLog: true },
  { id: "s02", number: 2, initials: "K.Z.", grade: 12, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false, preLog: true },
  { id: "s03", number: 3, initials: "S.W.", grade: 12, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false, preLog: true },
  { id: "s04", number: 4, initials: "C.L.", grade: 12, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false, preLog: true },
  { id: "s05", number: 5, initials: "E.F.", grade: 12, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false, preLog: true },
  { id: "s06", number: 6, initials: "N.L.", grade: 12, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false, preLog: true },
  { id: "s07", number: 7, initials: "J.L.", grade: 12, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false, preLog: true },
  {
    id: "s08",
    number: 8,
    initials: "A.L.",
    grade: "alumni",
    courses: ["Calculus and Vectors (MCV4U)"],
    since: "2025",
    lessonsLogged: 0,
    marks: [{ course: "MCV4U", label: "Final", value: 99 }],
    status: "Finished calculus with a 99 and was admitted to Electrical Engineering at Waterloo.",
    outcome: "Waterloo Electrical Engineering",
    listed: true,
  },
  {
    id: "s09",
    number: 9,
    initials: "D.B.",
    grade: 12,
    courses: ["Grade 11 Physics (SPH3U)", "Grade 12 Chemistry (SCH4U)"],
    since: "May 2026",
    lessonsLogged: 13,
    marks: [
      { course: "SPH3U", label: "May 3", value: 82 },
      { course: "SCH3U", label: "May 7", value: 95 },
      { course: "SPH3U", label: "May 10", value: 88 },
      { course: "SPH3U", label: "May 24", value: 93 },
      { course: "SPH3U", label: "Jun 7", value: 93 },
    ],
    status:
      "Signed off as ready for the physics exam in June. Now in grade 12 chemistry with an organic naming assessment in two weeks: this week's practice mixes every functional group covered so far.",
    statusDate: "Oct 4, 2026",
    listed: true,
  },
  {
    id: "s10",
    number: 10,
    initials: "H.",
    grade: 12,
    courses: [
      "Advanced Functions (MHF4U)",
      "Calculus and Vectors (MCV4U)",
      "Grade 12 Physics (SPH4U)",
      "Grade 12 Chemistry (SCH4U)",
    ],
    since: "July 2026",
    lessonsLogged: 40,
    marks: [],
    status:
      "Ran all four grade 12 courses front to back over the summer, before the school year started. Picks up new material after one or two examples; strong fundamentals in dynamics and derivatives. The remaining work is starting a question without a nudge.",
    statusDate: "Aug 26, 2026",
    listed: true,
  },
  // Enrolled, no lessons logged yet. Flip `listed` once there is something to show.
  { id: "s11", number: 11, initials: "B.", grade: 12, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false },
  {
    id: "s12",
    number: 12,
    initials: "F.",
    grade: 10,
    courses: ["Grade 10 Math (MPM2D)"],
    since: "September 2026",
    lessonsLogged: 7,
    marks: [{ course: "MPM2D", label: "Oct 2", value: 90 }],
    status:
      "Started the term unsure which factoring method a question needed. By the third week she was completing the word problems she had struggled with without instruction.",
    statusDate: "Oct 2, 2026",
    listed: true,
  },
  { id: "s13", number: 13, initials: "D.", grade: 11, courses: [], since: "", lessonsLogged: 0, marks: [], status: "", listed: false },
  {
    id: "s14",
    number: 14,
    initials: "L.",
    grade: 12,
    courses: ["Grade 12 Biology (SBI4U)", "Grade 12 Chemistry (SCH4U)"],
    since: "September 2026",
    lessonsLogged: 7,
    marks: [{ course: "SBI4U", label: "Sep 29", value: 78 }],
    status:
      "Picks concepts up quickly once they are reviewed. Biology is on Unit 1 review; chemistry is working on unit conversions, remembering when to multiply and when to divide.",
    statusDate: "Sep 29, 2026",
    listed: true,
  },
  {
    id: "s15",
    number: 15,
    initials: "A.",
    grade: 12,
    courses: ["Grade 12 Chemistry (SCH4U)", "Advanced Functions (MHF4U)"],
    since: "September 2026",
    lessonsLogged: 6,
    marks: [],
    status:
      "Most confident practice session yet on September 24. Practising how functional-group priority sets the prefix and suffix in a name, from a shared workbook.",
    statusDate: "Oct 1, 2026",
    listed: true,
  },
];

export const LISTED_STUDENTS = STUDENTS.filter((s) => s.listed);
export const PRE_LOG_COUNT = STUDENTS.filter((s) => !s.listed && s.preLog).length;
/** Enrolled students with nothing logged yet, by number. */
export const UNLOGGED_NUMBERS = STUDENTS.filter((s) => !s.listed && !s.preLog).map((s) => s.number);
export const studentLabel = (s: StudentEntry) => `Student ${s.number} · ${s.initials}`;

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
