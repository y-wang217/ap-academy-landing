/**
 * Turns one student's rows into what the screens show. Grades come only from
 * lib/domain; components render this and compute nothing (CLAUDE.md).
 */
import { assessmentState, type AssessmentState } from "../domain/assessment-state";
import { computeCourseGrade, validateSyllabus, type CourseGradeResult } from "../domain/grades";
import { nextPriorities, orderTasks, upcomingWork } from "../domain/priorities";
import { sixCourseProgress, type SixCourseProgress } from "../domain/progress";
import type { Assessment, Category, Course, Goal, Student, Task, Version } from "../data/schemas";

export type BundleLike = {
  student: Student;
  goal: Goal | null;
  courses: Course[];
  versions: Version[];
  categories: Category[];
  assessments: Assessment[];
  tasks: Task[];
};

export type AssessmentView = Assessment & { state: AssessmentState; courseCode: string; categoryName: string };

export type CourseView = {
  course: Course;
  version: Version | null;
  categories: Category[];
  syllabusErrors: ReturnType<typeof validateSyllabus>;
  result: CourseGradeResult;
  gapToTarget: number | null;
  assessments: AssessmentView[];
  graded: AssessmentView[];
  upcoming: AssessmentView[];
  awaiting: AssessmentView[];
  todos: Task[];
  supplemental: Task[];
};

export type StudentView = {
  student: Student;
  goal: Goal | null;
  progress: SixCourseProgress;
  courses: CourseView[];
  activeCourses: CourseView[];
  /** The dashboard's next priorities: open school tasks, pinned first, capped. */
  priorities: Task[];
  /** Every open school task in display order (teacher view). */
  schoolTasks: Task[];
  /** Every open supplemental task in display order. */
  supplemental: Task[];
  upcoming: AssessmentView[];
  lastUpdated: string | null;
};

function latest(stamps: (string | null | undefined)[]): string | null {
  return stamps.filter((s): s is string => !!s).sort().at(-1) ?? null;
}

export function buildStudentView(bundle: BundleLike, today: string): StudentView {
  const courseCode = new Map(bundle.courses.map((c) => [c.id, c.code]));
  const categoryName = new Map(bundle.categories.map((c) => [c.id, c.name]));
  const allAssessments: AssessmentView[] = bundle.assessments.map((a) => ({
    ...a,
    state: assessmentState(a, today),
    courseCode: courseCode.get(a.courseId) ?? "",
    categoryName: categoryName.get(a.categoryId) ?? "",
  }));

  const courses: CourseView[] = bundle.courses.map((course) => {
    const version = bundle.versions.find((v) => v.id === course.activeVersionId) ?? null;
    const categories = bundle.categories.filter((c) => version && c.versionId === version.id);
    const assessments = allAssessments.filter((a) => a.courseId === course.id);
    const result = computeCourseGrade(categories, assessments);
    const tasks = orderTasks(bundle.tasks.filter((t) => t.courseId === course.id));
    return {
      course,
      version,
      categories,
      syllabusErrors: validateSyllabus(categories),
      result,
      gapToTarget: result.grade !== null && course.targetGrade !== null ? result.grade - course.targetGrade : null,
      assessments,
      graded: assessments.filter((a) => a.state === "graded").sort((a, b) => (b.gradedAt ?? "").localeCompare(a.gradedAt ?? "")),
      upcoming: upcomingWork(assessments.filter((a) => a.state === "upcoming" || a.state === "done"), today, Infinity),
      awaiting: assessments.filter((a) => a.state === "awaiting_result"),
      todos: tasks.filter((t) => t.kind === "school"),
      supplemental: tasks.filter((t) => t.kind === "supplemental"),
    };
  });

  return {
    student: bundle.student,
    goal: bundle.goal,
    progress: sixCourseProgress(
      courses.map((c) => ({ inSixPlan: c.course.inSixPlan, grade: c.result.grade, targetGrade: c.course.targetGrade })),
      bundle.goal?.targetSixAvg ?? null,
    ),
    courses,
    activeCourses: courses.filter((c) => c.course.status === "active"),
    priorities: nextPriorities(bundle.tasks),
    schoolTasks: orderTasks(bundle.tasks.filter((t) => t.kind === "school")),
    supplemental: orderTasks(bundle.tasks.filter((t) => t.kind === "supplemental")),
    upcoming: upcomingWork(allAssessments, today),
    lastUpdated: latest([
      bundle.goal?.updatedAt,
      ...bundle.courses.map((c) => c.updatedAt),
      ...bundle.assessments.map((a) => a.updatedAt),
      ...bundle.tasks.map((t) => t.updatedAt),
    ]),
  };
}
