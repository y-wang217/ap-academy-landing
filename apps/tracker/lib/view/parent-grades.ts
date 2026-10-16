/**
 * What a parent's Grades tab shows (REQ-23): the child's student view with no
 * flags, plus the latest marks. Every grade comes from buildStudentView; the
 * only arithmetic here is one mark's earned / possible, as the chart reveal does.
 */
import { assessmentDate } from "../domain/assessment-date";
import { percent, points, shortDate } from "../format";
import { buildStudentView, type BundleLike, type StudentView } from "./student-view";

export type RecentMark = {
  id: string;
  dateText: string;
  courseCode: string;
  title: string;
  scoreText: string;
  percentText: string;
};

/** The newest scored, non-excused marks across every course, by the day the work happened. */
export function recentMarks(view: StudentView, limit = 5): RecentMark[] {
  return view.courses
    .flatMap((c) => c.graded)
    .sort(
      (a, b) =>
        (assessmentDate(b) ?? "").localeCompare(assessmentDate(a) ?? "") ||
        a.courseCode.localeCompare(b.courseCode) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit)
    .map((a) => {
      const earned = a.scoreEarned as number;
      return {
        id: a.id,
        dateText: shortDate(assessmentDate(a)),
        courseCode: a.courseCode,
        title: a.title,
        scoreText: `${points(earned)} / ${points(a.scorePossible)}`,
        percentText: percent((earned / a.scorePossible) * 100),
      };
    });
}

export function buildParentGrades(bundle: BundleLike, today: string): { view: StudentView; recent: RecentMark[] } {
  const view = buildStudentView({ ...bundle, flags: [] }, today);
  return { view, recent: recentMarks(view) };
}

export type ParentGradesState = { kind: "not_ready" } | { kind: "ready"; view: StudentView; recent: RecentMark[] };

export async function parentGradesState(
  child: { id: string; published: boolean },
  load: (id: string) => Promise<BundleLike | null>,
  today: string,
): Promise<ParentGradesState> {
  if (!child.published) return { kind: "not_ready" };
  const bundle = await load(child.id);
  if (!bundle) return { kind: "not_ready" };
  return { kind: "ready", ...buildParentGrades(bundle, today) };
}
