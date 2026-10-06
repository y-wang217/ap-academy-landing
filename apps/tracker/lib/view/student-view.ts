/**
 * Turns one student's rows into what the screens show. Grades come only from
 * lib/domain; components render this and compute nothing (CLAUDE.md).
 */
import { assessmentDate } from "../domain/assessment-date";
import { assessmentState, type AssessmentState } from "../domain/assessment-state";
import { computeCourseGrade, validateSyllabus, type CourseGradeResult } from "../domain/grades";
import { assessmentShares, gradeHistory, type HistoryPoint } from "../domain/history";
import { nextPriorities, orderTasks, upcomingWork } from "../domain/priorities";
import { sixCourseProgress, type SixCourseProgress } from "../domain/progress";
import { storyFacts } from "../domain/story";
import { suggestPriorities, type Suggestion } from "../domain/suggestions";
import { courseTrend, trendDelta, type Trend } from "../domain/trend";
import type { Assessment, Category, Course, Flag, Goal, Student, Task, Version } from "../data/schemas";
import { storyText, type StoryText } from "./story-text";
import { suggestionReason } from "./suggestion-text";

export type BundleLike = {
  student: Student;
  goal: Goal | null;
  courses: Course[];
  versions: Version[];
  categories: Category[];
  assessments: Assessment[];
  tasks: Task[];
  /** Open flags only. */
  flags: Flag[];
};

export type AssessmentView = Assessment & {
  state: AssessmentState;
  courseCode: string;
  categoryName: string;
  /** Rough share of the course grade, 0 to 100, from the syllabus weights. */
  share: number;
  /** The student's open flag on this grade, if any (ADR 0025). */
  openFlag: Flag | null;
};

export type SuggestionView = Suggestion & { reason: string; courseCode: string };

export type CourseView = {
  course: Course;
  version: Version | null;
  categories: Category[];
  syllabusErrors: ReturnType<typeof validateSyllabus>;
  result: CourseGradeResult;
  gapToTarget: number | null;
  /** Sum of the weights of categories with at least one mark, 0 to 100. */
  markedWeight: number;
  /** The grade on each date with a mark, oldest first (ADR 0031). */
  history: HistoryPoint[];
  trend: Trend;
  trendDelta: number | null;
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
  /** Every course that counts toward the six-course average, in position order, whatever its status. */
  planCourses: CourseView[];
  /** Active courses outside the plan. */
  otherActive: CourseView[];
  activeCourses: CourseView[];
  /** The one factual sentence under the progress number, and an optional second (ADR 0032). */
  story: StoryText;
  /** The dashboard's next priorities: open school tasks, pinned first, capped. */
  priorities: Task[];
  /** Every open school task in display order (teacher view). */
  schoolTasks: Task[];
  /** Every open supplemental task in display order. */
  supplemental: Task[];
  upcoming: AssessmentView[];
  /** Open grade flags, oldest first, for the teacher. */
  flagged: AssessmentView[];
  /** Rule-based suggestions for the teacher (ADR 0024). Students never see these. */
  suggestions: SuggestionView[];
  lastUpdated: string | null;
};

function latest(stamps: (string | null | undefined)[]): string | null {
  return stamps.filter((s): s is string => !!s).sort().at(-1) ?? null;
}

export function buildStudentView(bundle: BundleLike, today: string): StudentView {
  const courseCode = new Map(bundle.courses.map((c) => [c.id, c.code]));
  const categoryName = new Map(bundle.categories.map((c) => [c.id, c.name]));
  const openFlag = new Map(bundle.flags.filter((f) => f.resolvedAt === null).map((f) => [f.assessmentId, f]));
  const versionOf = new Map(bundle.courses.map((c) => [c.id, c.activeVersionId]));
  const shares = new Map<string, number>();
  for (const course of bundle.courses) {
    const categories = bundle.categories.filter((c) => c.versionId === versionOf.get(course.id));
    for (const [id, share] of assessmentShares(categories, bundle.assessments.filter((a) => a.courseId === course.id))) shares.set(id, share);
  }
  const allAssessments: AssessmentView[] = bundle.assessments.map((a) => ({
    ...a,
    state: assessmentState(a, today),
    courseCode: courseCode.get(a.courseId) ?? "",
    categoryName: categoryName.get(a.categoryId) ?? "",
    share: shares.get(a.id) ?? 0,
    openFlag: openFlag.get(a.id) ?? null,
  }));

  const courses: CourseView[] = bundle.courses.map((course) => {
    const version = bundle.versions.find((v) => v.id === course.activeVersionId) ?? null;
    const categories = bundle.categories.filter((c) => version && c.versionId === version.id);
    const assessments = allAssessments.filter((a) => a.courseId === course.id);
    const result = computeCourseGrade(categories, assessments);
    const history = gradeHistory(categories, assessments);
    const tasks = orderTasks(bundle.tasks.filter((t) => t.courseId === course.id));
    return {
      course,
      version,
      categories,
      syllabusErrors: validateSyllabus(categories),
      result,
      gapToTarget: result.grade !== null && course.targetGrade !== null ? result.grade - course.targetGrade : null,
      markedWeight: result.categories.filter((c) => c.scoredCount > 0).reduce((s, c) => s + c.weight, 0),
      history,
      trend: courseTrend({ grade: result.grade, targetGrade: course.targetGrade, history }),
      trendDelta: trendDelta(history),
      assessments,
      // Ordered by the day the work happened, never by the entry stamp (ADR 0030). Undated marks come last.
      graded: assessments.filter((a) => a.state === "graded").sort((a, b) => (assessmentDate(b) ?? "").localeCompare(assessmentDate(a) ?? "")),
      upcoming: upcomingWork(assessments.filter((a) => a.state === "upcoming" || a.state === "done"), today, Infinity),
      awaiting: assessments.filter((a) => a.state === "awaiting_result").sort((a, b) => (assessmentDate(a) ?? "").localeCompare(assessmentDate(b) ?? "")),
      todos: tasks.filter((t) => t.kind === "school"),
      supplemental: tasks.filter((t) => t.kind === "supplemental"),
    };
  });

  const openKeys = new Set(bundle.tasks.filter((t) => t.doneAt === null && t.suggestionKey).map((t) => t.suggestionKey as string));
  const suggestions = suggestPriorities(
    courses.map((c) => ({
      id: c.course.id, code: c.course.code, status: c.course.status, grade: c.result.grade, targetGrade: c.course.targetGrade,
      categories: c.result.categories.map((k) => ({ name: k.name, percent: k.percent })),
    })),
    allAssessments,
    today,
    openKeys,
  ).map((s) => {
    const code = courseCode.get(s.courseId) ?? "";
    return { ...s, courseCode: code, reason: suggestionReason(s, code) };
  });

  const planCourses = courses.filter((c) => c.course.inSixPlan);
  const progress = sixCourseProgress(
    courses.map((c) => ({ inSixPlan: c.course.inSixPlan, grade: c.result.grade, targetGrade: c.course.targetGrade })),
    bundle.goal?.targetSixAvg ?? null,
  );
  const story = storyText(
    storyFacts({
      hasGoal: bundle.goal !== null,
      progress,
      courses: planCourses.map((c) => ({ code: c.course.code, grade: c.result.grade, targetGrade: c.course.targetGrade, trendDelta: c.trendDelta })),
      upcoming: upcomingWork(allAssessments, today, Infinity).map((a) => ({ title: a.title, courseCode: a.courseCode, date: assessmentDate(a) as string, share: a.share })),
      awaitingCount: allAssessments.filter((a) => a.state === "awaiting_result").length,
      today,
    }),
  );

  return {
    student: bundle.student,
    goal: bundle.goal,
    progress,
    courses,
    planCourses,
    otherActive: courses.filter((c) => c.course.status === "active" && !c.course.inSixPlan),
    activeCourses: courses.filter((c) => c.course.status === "active"),
    story,
    priorities: nextPriorities(bundle.tasks),
    schoolTasks: orderTasks(bundle.tasks.filter((t) => t.kind === "school")),
    supplemental: orderTasks(bundle.tasks.filter((t) => t.kind === "supplemental")),
    upcoming: upcomingWork(allAssessments, today),
    flagged: allAssessments
      .filter((a) => a.openFlag !== null)
      .sort((a, b) => (a.openFlag as Flag).createdAt.localeCompare((b.openFlag as Flag).createdAt)),
    suggestions,
    lastUpdated: latest([
      bundle.goal?.updatedAt,
      ...bundle.courses.map((c) => c.updatedAt),
      ...bundle.assessments.map((a) => a.updatedAt),
      ...bundle.tasks.map((t) => t.updatedAt),
      ...bundle.flags.map((f) => f.createdAt),
    ]),
  };
}
